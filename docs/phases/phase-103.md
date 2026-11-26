# Phase 103: Comma Passenger Name Normalization Script & Phone Display Formatting

## Goal
Provide a resumable one-off Firestore migration CLI (`scripts/fix-comma-passenger-names.ts`) that flips simple `"Last, First"` passenger names to `"First Last"` across `/contacts` (recomputing `nameSearchTokens`) and `/trips` (`passengerName`), while logging multi-comma or suffix/corporate names for manual review. In parallel, introduce a shared pure `formatPhoneDisplay()` helper that renders US/NANP phone numbers as `(636) 348-0166` across dispatch, client, trip, and comms UI surfaces without altering `phoneNormalized` or E.164 telephony/SMS payloads.

## Design Decisions
- **Resumable Spark-Plan Batching:** Follow the pattern in `scripts/backfill-spark-indexes.ts` (`--dry-run` default vs `--commit`, 500-doc `writeBatch`, `orderBy(documentId())` + `startAfter`, JSON checkpoint in `reports/`, `--contacts-only`, `--trips-only`, `--max-docs <n>`, `--reset-checkpoint`).
- **Safe Comma-Flipping Rule:** Only flip names with a single comma, non-empty left/right segments, and a right segment that does not match common suffixes or corporate designators (`Jr.`, `Sr.`, `II`, `III`, `IV`, `PhD`, `MD`, `LLC`, `Inc`, `Corp`, `Ltd`). Multi-comma or skipped names are left untouched and written to a review report (`reports/passenger-name-skipped.json`).
- **Search Index Consistency:** When updating `/contacts/{contactId}.name`, recompute `nameSearchTokens` (and `updatedAt`) using `computeContactSearchFields` from `app/core/services/customer/contact.service.ts`.
- **Phone Lookup vs. Display Separation:** Keep `phoneNormalized` (digits-only) and E.164 (`+16363480166`) untouched in storage, Firestore queries, and Twilio/Nextiva APIs. Format strictly at the UI display boundary via `formatPhoneDisplay(raw: string): string` (strips leading `1` on 11-digit US numbers, formats 10-digit numbers as `(636) 348-0166`, and returns international/short/malformed strings as-is).

## Files to Touch
- `scripts/fix-comma-passenger-names.ts` — New resumable CLI script and exported pure `flipCommaName()` helper.
- `scripts/test-fix-comma-passenger-names.ts` — Unit tests for `flipCommaName()` and edge cases (single comma, multi-word first/last, suffixes, corporate names, multiple commas, no comma).
- `app/core/services/customer/contact.service.ts` (or `app/core/utils/phone.util.ts` re-exported from `contact.service.ts`) — Add pure `formatPhoneDisplay(raw: string): string`.
- `scripts/test-format-phone-display.ts` — Unit tests for `formatPhoneDisplay()` (`+16363480166`, `16363480166`, `6363480166`, `(636) 348-0166`, `+442079460958`, empty/partial strings).
- UI phone-rendering surfaces (sweep `app/components/domain/dispatch/` and `app/routes/` where `phone` / `passengerPhone` / `customerPhone` are displayed—e.g. `DispatchHeaderCallHud.tsx`, `DispatchPassengerCrmSection.tsx`, `SmsThreadPane.tsx`, `comms-timeline.util.ts`, `client-profile-workflows.util.ts`, `driver.tsx`, `corporate.tsx`, trip queue/cards) — Apply `formatPhoneDisplay(...)` to rendered phone strings only (not `tel:`/`sms:` hrefs or API payloads).

## Tasks
- [x] Implement `flipCommaName()` and the resumable `--dry-run` / `--commit` Firestore batch CLI in `scripts/fix-comma-passenger-names.ts` for `/contacts` (updating `name` + `nameSearchTokens` via `computeContactSearchFields`) and `/trips` (updating `passengerName`), writing skipped ambiguous names to `reports/passenger-name-skipped.json`.
- [x] Add unit tests in `scripts/test-fix-comma-passenger-names.ts` covering standard `"Last, First"`, multi-word names, suffixes (`Jr.`, `III`), corporate names (`LLC`, `Inc`), multi-comma strings, and unchanged names.
- [x] Implement `formatPhoneDisplay(raw: string): string` in `app/core/utils/phone.util.ts` (and re-export if convenient from `contact.service.ts`) and add unit tests in `scripts/test-format-phone-display.ts`.
- [x] Audit UI components rendering passenger/contact/caller phone numbers under `app/components/domain/` and `app/routes/` and apply `formatPhoneDisplay()` to visible text while keeping `phoneNormalized`, `tel:`/`sms:` links, and Twilio/Nextiva payloads unchanged.
- [x] Run typecheck and all targeted unit tests, then check off completed items in `docs/phases/phase-103.md`.

## Verification
- `npm run typecheck`
- `npx tsx scripts/test-fix-comma-passenger-names.ts`
- `npx tsx scripts/test-format-phone-display.ts`
- `npx tsx scripts/fix-comma-passenger-names.ts --dry-run --max-docs 50` (smoke check if local/Firebase creds are configured; otherwise note as skipped/unverified)
