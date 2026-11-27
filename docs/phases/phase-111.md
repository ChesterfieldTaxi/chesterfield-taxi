# Phase 111: Dispatch Return Trip Auto-Creation on Update & Quick Return Booking Actions

## Goal
Fix the dispatch trip editor so updating an unlinked trip with Return Trip and Auto-Create Return Trip enabled automatically generates and bidirectionally links the return trip(s). Additionally, add a quick "Create Return Booking" action (route automatically reversed and linked to the source trip) to both active/upcoming trips in the Client Profile window and the universal Trip Actions dropdown when a trip is not already linked to another trip.

## Design Decisions
- **Shared Linked-Trip Detection:** Centralize linked-trip detection in a pure helper (`hasTripLinkedCounterpart(trip, allTrips?)`) in `app/components/domain/dispatch/client-profile-workflows.util.ts` (checking `linkedTripId`, `linkedReturnTripId`, `metadata.linkedTripId`, `metadata.linkedReturnTripId`, `metadata.returnTripId`, `metadata.hasReturnTrip`, `metadata.isReturnRide`, and reverse references in `allTrips`) so the editor, Client Profile, and Trip Actions dropdown share one source of truth.
- **Edit Mode Return Auto-Creation:** Extract the return-trip creation and bidirectional linking logic in `app/components/domain/dispatch/booking/useDispatchBookingSubmission.ts` into a shared helper used by both create mode and `isEditMode` when `!hasLinkedTrip && returnTrip && autoCreateReturnTrip && returnDate && returnTime`.
- **Bidirectional Linking for Reversed-Route Return Drafts:** Add optional `linkedOutboundTripId?: string` to `DispatchFormValues` and a `linkToSourceTrip?: boolean` option to `buildReturnTabValuesFromClientTrip`. When a new draft with `linkedOutboundTripId` is submitted, set `linkedTripId` and `metadata.isReturnRide: true` on the new return trip and patch `linkedReturnTripId` / `metadata.hasReturnTrip: true` onto the source outbound trip (re-verifying the source trip is still unlinked before patching).
- **Eligibility Rules:**
  - Client Profile Active & Upcoming Rides strip: show `⇄ Return` when `!hasTripLinkedCounterpart(trip, trips)`.
  - `TripActionDropdown`: show `Create Return Booking` on non-cancelled, unlinked trips (active, upcoming, and completed); hide on cancelled or already-linked trips.

## Files to Touch
- `app/components/domain/dispatch/client-profile-workflows.util.ts` — Add `hasTripLinkedCounterpart` helper and `linkToSourceTrip` option to `buildReturnTabValuesFromClientTrip`.
- `app/components/domain/dispatch/booking/useDispatchBookingSubmission.ts` — Add `linkedOutboundTripId?: string` to `DispatchFormValues`, extract shared `createAndLinkReturnTrips` helper, invoke it in `isEditMode` when return auto-create is enabled, and link standalone return drafts back to `linkedOutboundTripId` on creation.
- `app/components/domain/dispatch/DispatchBookingEngine.tsx` — Use `hasTripLinkedCounterpart` (or keep aligned) and preserve `linkedOutboundTripId` in form state/hydration.
- `app/components/domain/dispatch/ClientProfileSections.tsx` — Add `onBookReturn?: (trip: Trip) => void` to `ClientUpcomingRidesStrip` and render `⇄ Return` button for unlinked trips.
- `app/components/domain/dispatch/ClientProfileWindow.tsx` — Wire `onBookReturn` on `ClientUpcomingRidesStrip` using `buildReturnTabValuesFromClientTrip(trip, nowMs, { linkToSourceTrip: true })` and pass `trips` context for linked-trip checks.
- `app/components/domain/dispatch/TripActionDropdown.tsx` — Add `onCreateReturnBooking` to `DispatchUniversalTripActions` / `TripActionDropdownProps` and render `Create Return Booking` when `!isCancelled && !isLinkedTrip`.
- `app/routes/dispatch.tsx` (and `TripActionDropdown` call sites in `TripQueueTableView.tsx`, `TripQueueCardsGrid.tsx`, `TripQueueCompactList.tsx`, `DispatchTripDetailsDrawer.tsx`, `DriverQueueWindow.tsx`, `DispatchLeftBookingSidebar.tsx`) — Wire `handleCreateReturnBooking` into `universalTripActions` and pass `onCreateReturnBooking` / `isLinkedTrip` to `TripActionDropdown`.

## Tasks
- [x] Add `hasTripLinkedCounterpart` and `linkToSourceTrip` support to `buildReturnTabValuesFromClientTrip` in `app/components/domain/dispatch/client-profile-workflows.util.ts`.
- [x] Update `DispatchFormValues` and `DispatchBookingEngine.tsx` to carry `linkedOutboundTripId?: string` across draft creation, values sync, and submission.
- [x] Refactor return-trip creation and bidirectional linking in `app/components/domain/dispatch/booking/useDispatchBookingSubmission.ts` into a shared helper, invoke it in `isEditMode` when `!hasLinkedTrip && returnTrip && autoCreateReturnTrip && returnDate && returnTime`, and link new bookings that carry `linkedOutboundTripId` back to their source trip (if still unlinked).
- [x] Update `ClientUpcomingRidesStrip` in `app/components/domain/dispatch/ClientProfileSections.tsx` and `ClientProfileWindow.tsx` to show `⇄ Return` on active/upcoming trips that are not already linked.
- [x] Update `TripActionDropdown.tsx` and its call sites (`dispatch.tsx`, queue views, drawer, driver queue window, left booking sidebar) to offer `Create Return Booking` (route automatically reversed and linked) on unlinked, non-cancelled trips.
- [x] Run verification commands and ensure zero TypeScript or build errors.

## Verification
- `npm run typecheck`
- `npm run build`
