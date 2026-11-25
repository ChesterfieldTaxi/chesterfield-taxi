# Phase 83: Zip Matrix Dynamic Columns & CSV Import

## Goal
Replace the hardcoded zip-code flat-rate matrix (`car`, `tip`, `total`, `customerCharge`, `driverPay`) with an admin-defined dynamic column schema per tariff. Admins can create, rename, retype, and reorder columns manually, or import a CSV whose header row proposes the columns (mapped and previewed before applying). The pricing engine only understands two column roles: `zip` and `price`.

## Design Decisions
- **Clean rewrite, no migration:** No zip-matrix data is saved in production. Remove `ZipRateMatrixEntry`, the `zipMatrix` / `zipMatrixRates` aliases, and delete `app/core/services/pricing/smoke-house-rates.data.ts`.
- **Data model (`app/core/types/tariff.ts`):**
  ```ts
  export type ZipColumnType = 'text' | 'currency' | 'integer' | 'boolean' | 'select';
  export type ZipColumnRole = 'zip' | 'price';
  export interface ZipMatrixColumn {
    key: string;        // stable slug derived from header/label at creation; NOT changed on rename
    label: string;      // display label (freely renamable)
    type: ZipColumnType;
    role?: ZipColumnRole;
    options?: string[]; // for 'select'
    required?: boolean;
    order: number;
  }
  export interface ZipMatrixRow { id: string; values: Record<string, string | number | boolean | null>; }
  // TariffProfile:
  zipMatrixColumns?: ZipMatrixColumn[];
  zipMatrixRows?: ZipMatrixRow[];
  ```
- **Schema rules:** Exactly one `role: 'zip'` column (type `text`, required) and exactly one `role: 'price'` column (type `currency`, required). Column keys unique. All other columns are informational/display only.
- **Zip format:** Exactly 5 digits (`/^\d{5}$/`). No ZIP+4, no prefixes. Zip values must be unique within a tariff. Engine matching: dropoff zip first, then pickup zip (current behavior), comparing the first 5 chars of the trip zip.
- **Driver pay:** `driverPay = price` (100% pass-through). No driver-pay role.
- **Row cap:** 5,000 rows per tariff (matrix stays inline in the Firestore tariff doc; 1 MB limit).
- **CSV parsing:** Client-side, pure service, hand-rolled RFC4180 parser (quoted fields, escaped `""`, embedded commas/newlines, CRLF/LF, UTF-8 BOM). No new dependency.
- **Import flow (3 steps dialog):** (1) Upload `.csv` → (2) Map columns: each CSV header becomes a proposed column with inferred type/role; admin can rename, retype, set role, reorder, or skip; or map onto an existing column → (3) Preview: valid/error counts, per-row errors, first 20 rows, choose **Replace all rows** or **Upsert by zip** (shows added/updated/unchanged counts) → Apply.
- **Inference:** Header matching `/zip|postal/i` → `zip` role; `/price|charge|fare|rate|flat|amount/i` → `price` role (first match; admin can change). Type inference from sample values: all `$`/decimal numbers → `currency`, integers → `integer`, yes/no/true/false/y/n/1/0 → `boolean`, else `text`. Zip column is always `text`.
- **Config-driven UI:** Editor table headers, mobile cards, add-row form, and cell inputs are all generated from `zipMatrixColumns` (no per-field hardcoded JSX). Domain logic (parse, infer, validate, coerce, apply, export) lives in services; components only consume them.
- **Export:** CSV export uses column `label`s as headers in `order`, so export → re-import round-trips losslessly.
- **Persistence & audit:** Save via the existing `RatesPanel` working-copy save path; update `summarizeZipMatrix` in the audit service to read `"<zip>: $<price>"`.

## Files to Touch
- `app/core/types/tariff.ts` — Remove `ZipRateMatrixEntry`, `zipMatrix`, `zipMatrixRates`; add `ZipColumnType`, `ZipColumnRole`, `ZipMatrixColumn`, `ZipMatrixRow`, and `zipMatrixColumns` / `zipMatrixRows` on `TariffProfile`.
- `app/core/services/pricing/zip-matrix-schema.service.ts` — **New.** `createDefaultZipColumns()` (Zip + Price), `slugifyColumnKey()` (unique), `validateSchema()`, `coerceValue(type, raw, options?)`, `validateRow()`, `getRoleColumn(columns, role)`, `addColumn/renameColumn/updateColumn/reorderColumns/removeColumn` (pure, return new arrays), `upsertRow/removeRow`.
- `app/core/services/pricing/zip-matrix-csv.service.ts` — **New.** `parseCsv(text)`, `inferColumns(headers, sampleRows, existingColumns?)`, `buildImportPreview({ csvText, mapping, existingColumns, existingRows, mode })` → `{ columns, rows, errors[{ line, column?, message }], summary{ added, updated, unchanged, removed, invalid } }`, `applyImport(...)` → `{ zipMatrixColumns, zipMatrixRows }`, `exportZipMatrixCsv(columns, rows)`. Enforce 5-digit zip, unique zip (later duplicate in file = error), 5,000-row cap.
- `app/core/services/pricing/tariff.service.ts` — Rewrite `evaluateZipMatrixFare` to resolve `zip`/`price` role columns from `zipMatrixColumns` and rows from `zipMatrixRows`; return `{ matchedRow, zip, price, subtotal, auditDetails }`. Update all other `zipMatrix`/`zipMatrixRates` references in this file (~lines 87, 225, 266, 835–840) to the new fields.
- `app/core/services/pricing/rules.ts` — Zip-matrix branch (~lines 321–373): use `zipMatrixRows`, `zipResult.zip` in line-item detail, `driverPay: zipResult.price`.
- `app/core/services/pricing/pricing-audit.service.ts` — `summarizeZipMatrix` reads role columns/rows (`"<zip>: $<price>"`).
- `app/core/services/pricing/smoke-house-rates.data.ts` — **Delete.**
- `app/components/domain/admin/pricing/rates/ZipCellInput.tsx` — **New.** Renders the correct input per `ZipColumnType` (text, currency, integer, boolean toggle/checkbox, select).
- `app/components/domain/admin/pricing/rates/ZipMatrixColumnManager.tsx` — **New.** List columns; add, rename label, change type, set role (enforcing one zip/one price), edit select options, reorder (up/down buttons), delete (confirm if column has data; block deleting role columns).
- `app/components/domain/admin/pricing/rates/ZipMatrixImportDialog.tsx` — **New.** 3-step Upload → Map → Preview/Apply dialog consuming `zip-matrix-csv.service.ts`.
- `app/components/domain/admin/pricing/rates/ZipRateMatrixEditor.tsx` — Rewrite to be schema-driven: props `{ columns, rows, onChange(columns, rows), readOnly }`; stats (count/min/avg/max) from `price` column; search across zip + text columns; dynamic desktop table + mobile cards + add-row form via `ZipCellInput`; buttons for Manage Columns, Import CSV, Export CSV.
- `app/components/domain/admin/pricing/rates/RatesPanel.tsx` — Pass/receive `zipMatrixColumns` / `zipMatrixRows`; initialize with `createDefaultZipColumns()` and `[]` when switching to `zip_matrix`; update summary label (~line 269) and save payload (~line 137).
- `scripts/test-4pillar-pricing.ts` — Update zip-matrix fixtures (~line 100) to the new shape.
- `scripts/test-zip-matrix-csv-import.ts` — **New.** Assertion script (tsx) covering the cases in Verification.

## Tasks
- [x] Rewrite zip-matrix types in `app/core/types/tariff.ts`; delete `smoke-house-rates.data.ts`.
- [x] Implement `zip-matrix-schema.service.ts` (defaults, slug keys, validation, coercion, column/row ops).
- [x] Implement `zip-matrix-csv.service.ts` (RFC4180 parser, inference, import preview, replace/upsert apply, export, 5-digit zip + uniqueness + 5,000-row cap).
- [x] Update `tariff.service.ts` `evaluateZipMatrixFare` and all other zip-matrix references to the role-based model.
- [x] Update `rules.ts` zip-matrix branch (`driverPay = price`) and `pricing-audit.service.ts` `summarizeZipMatrix`.
- [x] Build `ZipCellInput.tsx` and `ZipMatrixColumnManager.tsx`.
- [x] Build `ZipMatrixImportDialog.tsx` (Upload → Map → Preview/Apply with Replace / Upsert).
- [x] Rewrite `ZipRateMatrixEditor.tsx` to be fully schema-driven; wire Manage Columns / Import / Export.
- [x] Update `RatesPanel.tsx` wiring and defaults.
- [x] Update `scripts/test-4pillar-pricing.ts` fixtures; write `scripts/test-zip-matrix-csv-import.ts`.
- [x] Run verification commands and fix any failures.

## Verification
- `npm run typecheck`
- `npx tsx scripts/test-zip-matrix-csv-import.ts` — must assert:
  - Parser: quoted fields, escaped quotes, embedded comma/newline, CRLF, BOM, trailing blank line.
  - Inference: `Zip`/`Postal Code` → zip role; `Price`/`Flat Rate`/`Agreed Charge` → price role; currency/integer/boolean/text type detection.
  - Validation errors: non-5-digit zip (`6300`, `63005-1234`, `ABCDE`), duplicate zip in file, non-numeric price, missing required, invalid select option, >5,000 rows rejected, schema without zip or price role rejected.
  - Replace vs Upsert summaries (added/updated/unchanged/removed).
  - Export → re-import round-trip yields identical columns/rows.
  - `evaluateZipMatrixFare`: dropoff zip match, pickup fallback, no match → `null`, ZIP+4 trip input matched on first 5.
- `npx tsx scripts/test-4pillar-pricing.ts`
