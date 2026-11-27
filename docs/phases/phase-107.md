# Phase 107: Pre-Launch Firestore Test Record Cleanup & Launch Hygiene

## Goal
Provide a safe, dry-run-by-default Firebase Admin SDK CLI script to purge mock, stress-test, and demo records from Firestore (and optionally remove leftover setup/test Auth accounts) before going live, while preserving all real drivers, tariffs, zones, corporate accounts, and production settings. Also remove hardcoded setup credentials from `scripts/clear-mock-data.ts` and add a targeted unit test for the test-record classifier.

## Design Decisions
- **Admin SDK CLI with Dry-Run Default (`scripts/cleanup-prelaunch-test-data.ts`):**
  - Authenticate via `firebase-admin` (`--key=<path>`, `GOOGLE_APPLICATION_CREDENTIALS`, or auto-discovered local `*firebase-adminsdk*.json` in repo root) so it bypasses client-side rules cleanly without needing `signInWithEmailAndPassword`.
  - Default to **DRY-RUN** mode; require explicit `--execute` to delete or update any Firestore document or Auth user.
  - Export pure classifier helpers (`isMockTripRecord`, `isMockDriverRecord`, `isMockCorporateRecord`, `isMockContactOrCommsRecord`) so they can be unit-tested offline without touching live Firebase.
- **Scoped Collections & Safe Matching:**
  - `trips` (+ linked `tripTracking` and `tripTrackingLookup` docs): match `MOCK-*`, `stress_*`, `passenger.email === 'test@example.com'`, `pickupLocation.address === '123 Test St'`, `passenger.phone === '555-0100'`, or `Test<N> User`. Support `--include-all-trips` only when explicitly passed to wipe all pre-launch test bookings.
  - `drivers`: match `drv-101`, `drv-*`, `demo-*` (preserving real operator UIDs).
  - `corporateAccounts` & `corporateLookup`: match `corp-001`, `CORP-BAY-902`, or `*.example.com` billing emails.
  - `contacts`, `commsThreads`, `commsEvents`, `dispatchEmails`, `dispatch_alerts`, `inquiries`, `applications`, `invoices`, `driverPayouts`, `financialLedger`, `unbilledTransactions`: match explicit test/demo markers (`test@example.com`, `@*.example.com`, `555-0100`, `MOCK-`, `stress_`, `drv-`, `corp-001`).
  - `analytics/kpiSummary`: report current summary and optionally reset/recompute when `--execute` is run so launch KPIs start clean.
  - **Firebase Auth Setup Account Check:** Report if `admin_setup@chesterfieldtaxi.com` or `*@example.com` exists in Firebase Auth; only delete them if `--remove-setup-auth --execute` is explicitly passed.
- **Credential Hygiene (`scripts/clear-mock-data.ts`):**
  - Remove the hardcoded `admin_setup@chesterfieldtaxi.com` / password literal from `scripts/clear-mock-data.ts`, reading `ADMIN_SETUP_EMAIL` and `ADMIN_SETUP_PASSWORD` from environment variables instead and pointing operators to `cleanup-prelaunch-test-data.ts`.

## Files to Touch
- `scripts/cleanup-prelaunch-test-data.ts` — New dry-run-by-default Firebase Admin pre-launch cleanup CLI + exported pure classifier helpers.
- `scripts/clear-mock-data.ts` — Remove hardcoded email/password literal and read from `process.env` with deprecation notice.
- `scripts/test-prelaunch-cleanup.ts` — Unit test verifying classifier helpers accurately flag mock/demo records and never flag real production records.

## Tasks
- [x] Create `scripts/cleanup-prelaunch-test-data.ts` with exported pure test-record classifiers (`isMockTripRecord`, `isMockDriverRecord`, `isMockCorporateRecord`, `isMockContactOrCommsRecord`), dry-run summary output, `--execute`, `--verbose`, `--key=<path>`, `--include-all-trips`, and `--remove-setup-auth` flags.
- [x] Update `scripts/clear-mock-data.ts` to remove hardcoded setup credentials and read from `process.env.ADMIN_SETUP_EMAIL` / `process.env.ADMIN_SETUP_PASSWORD`.
- [x] Create `scripts/test-prelaunch-cleanup.ts` to test positive and negative cases for every classifier helper.
- [x] Run `npm run typecheck` and `npx tsx scripts/test-prelaunch-cleanup.ts`.

## Verification
- `npm run typecheck`
- `npx tsx scripts/test-prelaunch-cleanup.ts`
