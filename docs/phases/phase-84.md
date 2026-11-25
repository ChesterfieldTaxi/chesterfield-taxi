# Phase 84: Corporate Accounts JSON Importer (Service, Admin UI & CLI)

## Goal
Enable importing `corporate_accounts.json` (and similarly structured JSON account directories) into the Corporate Directory via both an in-app Admin UI modal and the CLI importer script, backed by reusable parsing and state-preserving upsert logic in `CorporateAccountService`.

## Design Decisions
- **Strict Service/UI Abstraction:** All JSON parsing, `<br>` / `Attn:` normalization, `CORP-{id}` mapping, and upsert merge logic live in `CorporateAccountService`; UI components and the CLI script strictly consume the service.
- **Upsert & Preserve Operational State:** Matching accounts (by `accountNumber` case-insensitively or `id`) update `companyName`, `billingAddress`, `billingContactEmail` (when provided), `billingContactName` (only when currently empty or `'Accounts Payable'`), and `updatedAt`, while preserving `poRequired`, `currentPoNumber`, `poGeneratedAt`, `poExpiresAt`, `poNumberHistory`, `bookingPin`, `creditLimit`, `discountPercent`, `billingCycle`, `isActive`, `authorizedBookers`, `authorizedRiders`, `costCenters`, `savedCompanyLocations`, and `portalManagers`.
- **Safe Defaults for New Accounts:** Newly imported accounts default to `poRequired: false`, `discountPercent: 0`, `creditLimit: 5000`, `billingCycle: 'net30'`, `isActive: true`, and a generated `currentPoNumber` via `generateSecurePoNumber`.
- **Address & Type Normalization:** `<br>` / `<br/>` tags in `address` are normalized to newlines (`\n`); a leading `Attn: ...` line is extracted into `billingContactName` (falling back to `'Accounts Payable'`) and removed from `billingAddress`. `type` (`'standard'` | `'delivery'`) is recorded in `notes` when `'delivery'`.
- **Dual-Write Parity:** Both the Admin UI and CLI script persist to `config/appSettings` and sync to `/corporateAccounts/{id}` and `/corporateLookup/{accountHash}`.

## Files to Touch
- `app/core/services/corporate-account.service.ts` — Add `parseCorporateAccountsJson(jsonText, options)` and `mergeCorporateAccounts(existing, incoming)` (returning `{ merged, addedCount, updatedCount, skippedCount }`).
- `app/components/domain/admin/corporate/CorporateAccountModals.tsx` — Add `CorporateImportJsonModal` with `.json` file picker, dry-run preview (parsed count, new vs. updated counts, sample rows), and confirm action.
- `app/components/domain/admin/customers/CorporateDirectoryPanel.tsx` — Add an "Import JSON" button in the toolbar (gated on `onSave`) and wire `CorporateImportJsonModal`.
- `app/components/domain/admin/subpages/AdminCustomersSubpage.tsx` — Pass an `onImportCorporateAccounts` handler (or handle save + `syncAccountsBatchToFirestore` for added/updated accounts) into `CorporateDirectoryPanel`.
- `scripts/import-corporate-accounts.ts` — Auto-detect `.json` vs `.csv` input (accepting `corporate_accounts.json`) and use `parseCorporateAccountsJson` + `mergeCorporateAccounts`.
- `scripts/test-corporate-json-import.ts` — Unit test verifying JSON parsing, `<br>`/`Attn:`/`delivery` normalization, and operational-state-preserving upsert.

## Tasks
- [x] Add `parseCorporateAccountsJson` and `mergeCorporateAccounts` to `app/core/services/corporate-account.service.ts`.
- [x] Add `CorporateImportJsonModal` to `app/components/domain/admin/corporate/CorporateAccountModals.tsx` with `.json` file upload, validation/error state, and dry-run summary preview.
- [x] Add the "Import JSON" button and modal wiring to `app/components/domain/admin/customers/CorporateDirectoryPanel.tsx` and `app/components/domain/admin/subpages/AdminCustomersSubpage.tsx` (persisting via `onSave` + `syncAccountsBatchToFirestore`).
- [x] Update `scripts/import-corporate-accounts.ts` to support `.json` files via `parseCorporateAccountsJson` and `mergeCorporateAccounts`.
- [x] Create `scripts/test-corporate-json-import.ts` to test parsing, normalization, and upsert preservation against `corporate_accounts.json` and synthetic edge cases.
- [x] Run verification commands and check off completed items.

## Verification
- `npm run typecheck`
- `npx tsx scripts/test-corporate-json-import.ts`
