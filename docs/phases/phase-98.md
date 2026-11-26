# Phase 98: TaxiCaller Historical Client Importer (Zero-AI CLI)

## Goal
Build a deterministic, zero-AI-credit CLI importer and pure transformation utility that ingests all 26 TaxiCaller JSON exports in `clients_history/` (2021–2026), filters out test and Smoke House noise, deduplicates repeat customers, enriches `ContactRecord` profiles with saved places, gate codes, and corporate account links, and batch-upserts them into Firestore `contacts`.

## Design Decisions
- **Zero-AI Deterministic Pipeline:** Pure TypeScript parsing and deduplication in `app/core/services/customer/taxicaller-import.util.ts` so it is testable, reusable for a future Admin UI upload button, and compliant with `constitution.md` (strict service/UI abstraction).
- **Inclusion Criteria:** Keep deduplicated clients (keyed by normalized 10-digit / E.164 phone) that have `tripCount >= 2`, OR a valid `passenger.email`, OR a non-empty `account.name`.
- **Noise Filtering:** Skip rows matching `"test"` or `"smoke house"` (in `passenger`, `from`, `to`, or `info`), known Smoke House / placeholder phones, and invalid phones (`< 10` digits).
- **Enrichment onto `ContactRecord`:**
  - Aggregate non-airport, non-zip-only `from`/`to` street addresses (excluding hubs like `Lambert AP`, `Spirit of St Louis Airport`, `Smoke House`) into `savedPlaces` (deduped via `normalizePlaceAddressKey`), setting `homeAddress` to the top frequent residential address.
  - Extract gate codes from `info` (e.g., `Gate code #4848`, `Gate Code 5209`) into `notes` / matching `savedPlace.notes`.
  - Link `account.name` (e.g., `"171"`, `"300"`) against Firestore `corporateAccounts` to populate `corporateAccountId`, `corporateAccountNumber`, and `corporateAccountName`.
- **Safe Firestore & Storage Guardrails:** CLI supports `--dry-run` (default, outputs stats + CSV preview) and `--commit` (500-doc `writeBatch` with `{ merge: true }` on `contacts`). Verify `ContactService.saveToStorage()` in `app/core/services/customer/contact.service.ts` safely catches `localStorage` `QuotaExceededError` when syncing ~9k+ contacts.

## Files to Touch
- `app/core/services/customer/taxicaller-import.util.ts` — Create pure TaxiCaller JSON parser, noise filter, phone deduplicator, gate-code extractor, saved-places aggregator, and corporate-account linker.
- `scripts/import-clients-history.ts` — Create CLI runner (modeled after `scripts/import-corporate-accounts.ts`) supporting `--dry-run` (default), `--commit`, `--dir`, and `--report` CSV export.
- `app/core/services/customer/contact.service.ts` — Verify/harden `saveToStorage()` against `QuotaExceededError` for large synced contact directories.
- `scripts/test-taxicaller-client-import.ts` — Create targeted unit tests covering filtering (`test`/`smoke house`/short phones), repeat-client merging, gate-code extraction, `savedPlaces` aggregation, and corporate account linking.

## Tasks
- [x] Create `app/core/services/customer/taxicaller-import.util.ts` with pure types and helpers for parsing TaxiCaller `{ root: { rows: [...] } }` exports, filtering noise, deduplicating by normalized phone, extracting gate codes, aggregating frequent `savedPlaces`, and linking `corporateAccounts`.
- [x] Inspect `saveToStorage()` in `app/core/services/customer/contact.service.ts` and ensure `QuotaExceededError` is caught cleanly without breaking contact hydration or throwing in the UI.
- [x] Create `scripts/import-clients-history.ts` reading `clients_history/*.json`, supporting `--dry-run` (default, prints summary counts + optional CSV report) and `--commit` (loads `corporateAccounts` from Firestore and batch-upserts `contacts` in chunks of 500 with `{ merge: true }`).
- [x] Create `scripts/test-taxicaller-client-import.ts` testing all transformation, filtering, dedupe, place aggregation, gate-code extraction, and account-linking behaviors using non-secret test fixtures.
- [x] Run `npx tsx scripts/import-clients-history.ts --dry-run` against `clients_history/` to verify real-world counts and zero crashes on all 26 JSON files.

## Verification
- `npm run typecheck`
- `npx tsx scripts/test-taxicaller-client-import.ts`
- `npx tsx scripts/import-clients-history.ts --dry-run`
