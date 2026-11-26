# Phase 101: Spark-Plan Data Pipeline Optimization (Bounded Trips, Indexed Contact Search & KPI Summary)

## Goal
Eliminate the 45,000-trip and 9,000-contact full-collection fetches and `localStorage` churn that cause slow trip updates and high Firestore read consumption on the Firebase Spark plan (50,000 reads/day). Replace unbounded listeners with a shared active-window trip subscription (`docChanges()` + optimistic `updateTrip`), on-demand indexed contact search with a small LRU cache, cursor-paginated historical queries, and a 1-read KPI summary document.

## Design Decisions
- **Firestore Persistent Cache:** Enable `initializeFirestore` with `persistentLocalCache` + `persistentMultipleTabManager` in `app/core/services/firebase.ts` so reloads and multi-tab sessions reuse IndexedDB cache.
- **Active-Window Trip Listener (Singleton):** Replace unbounded `subscribeToAllTrips` with a shared, ref-counted active-window subscription (`status in [pending, confirmed, offered, assigned, en_route, arrived, in_progress]` + recent 7 days / next 30 days capped at `limit(500)`), applying incremental `snapshot.docChanges()` updates into an in-memory `Map<string, Trip>`.
- **Fast Optimistic `updateTrip` / `updateTripStatus`:** Read the prior trip from the in-memory `Map` (falling back to `getDoc` only on cache miss), update the in-memory `Map` and notify subscribers immediately, and skip `localStorage` (`chesterfield_taxi_mock_trips`) serialization/deserialization when `isFirebaseConfigured()` is true.
- **Paginated Historical Trips & 1-Read Dashboard KPIs:** Add cursor-based (`startAfter` + `limit(50)`) and customer/date-filtered queries on `BookingService` for Admin Trips, Customer History, Payouts, and server/dispatch callers; maintain an `analytics/kpiSummary` doc via Firestore `increment()` on trip create/complete/cancel so `AdminDashboardTab` reads KPIs in 1 document read.
- **Option A — On-Demand Indexed Contact Search & Paginated Directory:** Replace `syncContactsFromFirestore()` (9,000-doc `getDocs`) and `localStorage` full-dump with normalized search fields (`phoneNormalized`, `emailLower`, `nameSearchTokens`), `searchContactsRemote(query, limit=25)`, `listContactsPage(cursor, limit=50)`, and an in-memory LRU cache.
- **Filtered `users` Listener:** Scope `OperatorService.ensureFirestoreSubscription()` with `where('roles', 'array-contains-any', ['admin', 'dispatcher', 'driver', 'operator'])` so customer-only user docs are never downloaded.
- **One-Time Backfill Utility:** Provide a resumable, 500-doc `writeBatch` backfill script/utility to populate normalized contact search fields for existing 9,000 contacts and seed `analytics/kpiSummary` from existing 45,000 trips.

## Files to Touch
- `firestore.indexes.json` — Add composite indexes for windowed trips, customer/date-filtered trip queries, and indexed contact search.
- `app/core/services/firebase.ts` — Configure `initializeFirestore` with `persistentLocalCache` and `persistentMultipleTabManager`.
- `app/core/services/booking-service.ts` — Add `subscribeToActiveTrips`, `queryTripsPage`, `getTripsByCustomer`, and `getActiveAndUpcomingTrips` interface methods.
- `app/core/services/booking/firebase-booking.service.ts` — Implement singleton windowed listener with `docChanges()`, fast optimistic `updateTrip`/`updateTripStatus` without `localStorage` churn, and paginated/filtered trip queries.
- `app/core/services/booking/mock-booking.service.ts` — Implement matching interface methods for local/mock mode.
- `app/core/services/analytics/kpi-summary.service.ts` — New service to read `analytics/kpiSummary` (1 read) and apply atomic `increment()` updates on trip lifecycle transitions.
- `app/core/services/customer/contact.service.ts` — Add normalized search fields (`phoneNormalized`, `emailLower`, `nameSearchTokens`), in-memory LRU cache, `searchContactsRemote`, and `listContactsPage`; deprecate/remove bulk 9,000-doc `syncContactsFromFirestore` and full `localStorage` dump.
- `app/core/services/booking/passenger-lookup.service.ts` — Replace `getAllTrips()` scan in `searchPassengers` with `ContactService.searchContactsRemote`.
- `app/core/services/operator.service.ts` — Filter `users` `onSnapshot` to staff/driver roles only.
- `app/core/hooks/dispatch/useDispatchWorkspaceSync.ts` — Use `subscribeToActiveTrips` instead of `subscribeToAllTrips`.
- `app/components/domain/dispatch/EmailDock.tsx` — Reuse active-window trips subscription instead of opening a duplicate full-collection listener.
- `app/routes/dispatch.popout.tsx` — Switch to `subscribeToActiveTrips`.
- `app/routes/driver.tsx` — Ensure `subscribeToDriverTrips` is used cleanly without falling back to full 45k `subscribeToAllTrips` when Firebase is configured.
- `app/components/domain/admin/AdminDashboardTab.tsx` — Read KPIs from `kpi-summary.service.ts` and recent/active trips from `subscribeToActiveTrips`.
- `app/components/domain/admin/trips/useAdminTripsController.ts` — Combine active-window trips with cursor-paginated `queryTripsPage` for historical browsing/filtering.
- `app/components/domain/admin/subpages/AdminCustomersSubpage.tsx` — Use `listContactsPage` / `searchContactsRemote` and `getTripsByCustomer` instead of `getAllTrips()` + `syncContactsFromFirestore()`.
- `app/components/domain/admin/invoicing/useAdminPayoutsController.ts` — Replace `getAllTrips()` with date/status-filtered trip query.
- `app/core/services/dispatch/standing-order.service.ts`, `app/core/services/dispatch/staged-driver-planner.service.ts`, `app/core/services/dispatch/auto-dispatch.server.ts`, `app/core/services/dispatch/sla-cron.server.ts`, `app/core/services/tracking/guest-manage-ride.server.ts` — Replace `getAllTrips()` calls with targeted active/upcoming or single-doc/token queries.
- `scripts/backfill-spark-indexes.ts` — New resumable one-time CLI script (500-doc `writeBatch` chunks) to backfill contact search fields and seed `analytics/kpiSummary`.

## Tasks
- [x] Enable `persistentLocalCache` with `persistentMultipleTabManager` in `app/core/services/firebase.ts` (with safe SSR fallback).
- [x] Add required composite indexes to `firestore.indexes.json`.
- [x] Extend `BookingService` (`app/core/services/booking-service.ts`), `FirebaseBookingService`, and `MockBookingService` with singleton `subscribeToActiveTrips` (using `docChanges()`), `queryTripsPage` (`startAfter` + `limit`), `getTripsByCustomer`, and `getActiveAndUpcomingTrips`.
- [x] Optimize `updateTrip` and `updateTripStatus` in `FirebaseBookingService` to use in-memory cache lookup, optimistic subscriber notification, and skip `localStorage` `chesterfield_taxi_mock_trips` churn when Firebase is configured.
- [x] Create `app/core/services/analytics/kpi-summary.service.ts` and wire atomic `increment()` updates into trip creation, completion, and cancellation.
- [x] Update `ContactService` (`app/core/services/customer/contact.service.ts`) with normalized search fields, LRU cache, `searchContactsRemote`, and `listContactsPage`, removing the 9,000-doc `getDocs` + `localStorage` dump; update `PassengerLookupService` to use it.
- [x] Filter `OperatorService.ensureFirestoreSubscription()` (`app/core/services/operator.service.ts`) to staff/driver roles only.
- [x] Migrate Dispatch (`useDispatchWorkspaceSync.ts`, `EmailDock.tsx`, `dispatch.popout.tsx`, `driver.tsx`) and Admin (`AdminDashboardTab.tsx`, `useAdminTripsController.ts`, `AdminCustomersSubpage.tsx`, `useAdminPayoutsController.ts`) to the bounded/paginated APIs and 1-read KPI summary.
- [x] Replace remaining `getAllTrips()` calls in `standing-order.service.ts`, `staged-driver-planner.service.ts`, `auto-dispatch.server.ts`, `sla-cron.server.ts`, and `guest-manage-ride.server.ts` with targeted queries.
- [x] Add `scripts/backfill-spark-indexes.ts` for one-time contact search-field backfill and `analytics/kpiSummary` seeding.

## Verification
- `npm run typecheck`
- `npm run build`
