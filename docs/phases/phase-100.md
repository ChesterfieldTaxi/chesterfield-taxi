# Phase 100: Imported Trip Location & Pricing Backfill CLI

## Goal
Add a cost-guarded CLI backfill tool (`scripts/backfill-imported-trip-pricing.ts`) that hydrates missing coordinates, ZIP codes, place IDs, and fares on imported `$0.00` TaxiCaller trips in Firestore. By default it targets trips scheduled after `2026-11-26`, supports `--dry-run` cost/count estimation before any API calls or writes, and includes an `--all` flag for historical `$0.00` trips.

## Design Decisions
- **CLI-only (`--dry-run` + `--commit`):** Zero UI changes; follows the `scripts/import-clients-history.ts` pattern with Firebase client auth/env loading, `sanitizePayload`, `writeBatch`, and optional CSV audit report (`--report`).
- **Date & Scope Filtering:** Default filter selects trips where `pricing.totalFare === 0` (and `metadata.source === 'taxicaller_import'` or missing pickup/dropoff coordinates) with `scheduledPickupTime > 2026-11-26T23:59:59.999` (overridable via `--after <ISO>` or `--all`).
- **Google Maps Cost Guardrails:**
  - Resolve known landmarks/airports locally first (`CANONICAL_STL_LOCATION`, Firestore `specialPlaces`, and saved contact places with coordinates) and parse 5-digit ZIP codes from address strings before calling Google Geocoding.
  - Deduplicate unique address strings before calling Google Geocoding API, and deduplicate unique `(origin -> destination)` pairs before calling `ServerRouteService` (Google Directions API).
  - Support `--limit <N>` and `--max-api-calls <N>` hard caps, and print an exact estimate of matching trips, unique addresses to geocode, unique routes to calculate, and estimated API calls during `--dry-run`.
- **Strict Service Separation (per `constitution.md`):** Pure filtering, deduplication, cost-estimation, and pricing-hydration helpers live in `app/core/services/booking/imported-trip-backfill.util.ts` and reuse `pipePricing` / `toTripPricing` from `app/core/services/pricing/pipeline.ts` and `ServerRouteService` from `app/core/services/maps/server-route.service.ts`.

## Files to Touch
- `app/core/services/booking/imported-trip-backfill.util.ts` — New pure utility for candidate trip filtering (`--after` / `--all`), local landmark/ZIP matching, address & route deduplication, dry-run API call estimation, and `Trip` location + `TripPricing` hydration via `pipePricing` / `toTripPricing`.
- `scripts/backfill-imported-trip-pricing.ts` — New CLI script (`--dry-run`, `--commit`, `--all`, `--after <ISO>`, `--limit <N>`, `--max-api-calls <N>`, `--report <csv>`, `--email`, `--password`) that reads Firestore `trips`, `settings`, `tariffs`, `pricingRules`, and `specialPlaces`, runs Google Geocoding + `ServerRouteService` within `--max-api-calls`, and batch-updates Firestore `trips`.
- `scripts/test-imported-trip-backfill.ts` — New unit test suite covering date cutoff filtering (`> 2026-11-26` vs `--all`), address/route deduplication, `--max-api-calls` guardrails, and pricing hydration without live network calls.

## Tasks
- [x] Create `app/core/services/booking/imported-trip-backfill.util.ts` with pure helpers for:
  - Identifying eligible `$0.00` imported trips (`isEligibleImportedZeroFareTrip`) with default `2026-11-26T23:59:59.999` cutoff, `--after`, and `--all` support.
  - Local resolution (5-digit ZIP regex extraction, Lambert STL canonical match, `specialPlaces` match) and deduplicated address / route key generation.
  - Cost/API-call estimation summary for `--dry-run`.
  - Pure trip hydration helper (`hydrateImportedTrip`) that applies resolved `TripLocation` fields (`coordinates`, `formattedAddress`, `placeId`, `zipCode`) and computes `pricing` via `pipePricing` + `toTripPricing`, updating `payment.amount` only when it is `0`.
- [x] Create `scripts/backfill-imported-trip-pricing.ts` following `scripts/import-clients-history.ts` conventions:
  - Load `.env.local` / `.env`, initialize Firebase, authenticate if `--email`/`--password` provided, and load Firestore `trips`, `specialPlaces`, `tariffs`, `pricingRules`, and `settings`.
  - In `--dry-run` (default): print trip counts, unique addresses needing geocoding, unique routes needing Directions, and estimated Google API calls without calling Google APIs or writing to Firestore; optionally write CSV preview via `--report`.
  - In `--commit`: enforce `--max-api-calls` and `--limit`, geocode deduplicated addresses via Google Geocoding HTTPS API, compute routes via `ServerRouteService`, hydrate trips, and commit updates in chunks using `writeBatch` + `sanitizePayload`.
- [x] Create `scripts/test-imported-trip-backfill.ts` with unit tests for filtering, deduplication, cost estimation, API cap enforcement, and `hydrateImportedTrip` pricing output.
- [x] Run verification commands and confirm all checks pass.

## Verification
- `npm run typecheck`
- `npx tsx scripts/test-imported-trip-backfill.ts`
