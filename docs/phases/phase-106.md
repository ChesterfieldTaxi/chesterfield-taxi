# Phase 106: Dispatch Package Delivery Mode, Shared Special Places & Airport Detection Fix

## Goal
Add a **Package** delivery mode alongside **Passenger** mode on the Dispatch booking form with optional contact name/phone and package notes, surface a `PACKAGE` badge across Dispatch Queue, Trip Details Drawer, and Driver views, wire `DispatchLocationInput` to `SpecialPlacesService` so Dispatch and public booking share the same Admin-configured Special Places, and fix the `Chesterfield Airport Rd` airport-detection false positive.

## Design Decisions
- **Trip Schema (`bookingCategory`):** Add `bookingCategory?: 'passenger' | 'package'` (defaults to `'passenger'` when omitted) and `packageDetails?: { description?: string }` on `Trip` in `app/core/types/trip.ts`. When `bookingCategory === 'package'` and contact name/phone are left blank, `useDispatchBookingSubmission` populates `trip.passenger` with `{ firstName: 'Package', lastName: 'Delivery', phone: '' }` (or the optional contact name/phone when provided).
- **Dispatch Booking UI (`Passenger | Package`):** Add a segmented toggle (`Passenger` | `Package`) at the top of `DispatchPassengerCrmSection.tsx`. In `Package` mode:
  - Contact Name and Contact Phone are optional (no `required` attributes; caller CRM lookup still works if typed).
  - Show an optional Package Description / Delivery Notes field.
  - Hide passenger-only UI: `Add passenger` button, additional passengers list, `Booker is different from Passenger`, passenger count stepper, car seats, and comfort flags (`quietRide`, `musicOk`, `petFriendly`).
  - Bypass `!passengerName.trim()` and `!phone.trim()` validation guards in `useDispatchBookingSubmission.ts` when `bookingCategory === 'package'`.
- **Pricing:** Uses the existing pricing rules and tariff pipeline unchanged (so existing corporate/location rates such as Smoke House apply automatically).
- **Downstream Visibility (`PACKAGE` Badge):** Render a `PACKAGE` badge (and package description if present) in Dispatch Queue views (`TripQueueCardsGrid`, `TripQueueTableView`, `TripQueueCompactList`), `DispatchTripDetailsDrawer`, and the Driver trip view (`app/routes/driver.tsx` / driver components).
- **Shared Special Places in Dispatch:** Wire `DispatchLocationInput.tsx` to `getSpecialPlacesService()` (subscribing to updates and displaying `searchPlaces(inputValue)` results with clean `name` / `shortName` above Google Places predictions, matching `LocationAutocomplete.tsx`).
- **Airport Detection Fix:** Update `detectAirportInAddresses` in `app/core/config/airports.ts` so street addresses on `Chesterfield Airport Rd` / `Chesterfield Airport Road` do not false-positive as `SUS` (Spirit of St. Louis Airport) and trigger the flight toggle.

## Files to Touch
- `app/core/types/trip.ts` — Add `bookingCategory?: 'passenger' | 'package'` and `packageDetails?: { description?: string }`.
- `app/components/domain/dispatch/DispatchBookingEngine.tsx` — Manage `bookingCategory` and `packageDescription` state, pass props to sections/hooks, and hydrate on edit/clone/copy.
- `app/components/domain/dispatch/booking/DispatchPassengerCrmSection.tsx` — Add `Passenger | Package` segmented toggle, optional Contact Name/Phone + Package Description input, and hide passenger-only controls in `Package` mode.
- `app/components/domain/dispatch/booking/DispatchExtrasVehicleSection.tsx` — Hide passenger count, car seats, and passenger comfort flags when `bookingCategory === 'package'`.
- `app/components/domain/dispatch/booking/useDispatchBookingSubmission.ts` — Skip required passenger/phone checks in `Package` mode, default `trip.passenger` when contact is blank, and persist `bookingCategory` & `packageDetails`.
- `app/components/domain/dispatch/booking/useDispatchDraftSync.ts` — Persist/restore `bookingCategory` and `packageDescription` in drafts.
- `app/components/domain/dispatch/queue/TripQueueCardsGrid.tsx`, `TripQueueTableView.tsx`, `TripQueueCompactList.tsx` — Show `PACKAGE` badge for package trips.
- `app/components/domain/dispatch/DispatchTripDetailsDrawer.tsx` — Show `PACKAGE` badge and `packageDetails.description`.
- `app/routes/driver.tsx` (and/or `app/components/domain/driver/*`) — Show `PACKAGE` badge and package description on active/assigned driver trip cards.
- `app/components/domain/dispatch/DispatchLocationInput.tsx` — Replace hardcoded `REGIONAL_DISPATCH_LOCATIONS` fallback with `getSpecialPlacesService()` subscription + `searchPlaces(inputValue)` suggestions matching `LocationAutocomplete.tsx`.
- `app/core/config/airports.ts` — Prevent `Chesterfield Airport Rd` / `Chesterfield Airport Road` street addresses from matching the `SUS` `'chesterfield airport'` keyword.

## Tasks
- [x] Add `bookingCategory` and `packageDetails` fields to `Trip` in `app/core/types/trip.ts`.
- [x] Wire `bookingCategory` (`'passenger' | 'package'`) and `packageDescription` state through `DispatchBookingEngine.tsx`, `useDispatchDraftSync.ts`, and `useDispatchBookingSubmission.ts` (including edit/clone/copy hydration and optional contact fallback).
- [x] Update `DispatchPassengerCrmSection.tsx` with the `Passenger | Package` segmented toggle, optional Contact Name/Phone, Package Description field, and conditional hiding of passenger-only controls.
- [x] Update `DispatchExtrasVehicleSection.tsx` to hide passenger count, car seats, and passenger comfort flags when `bookingCategory === 'package'`.
- [x] Add `PACKAGE` badge (and package description display) to Dispatch Queue views, `DispatchTripDetailsDrawer.tsx`, and Driver trip view.
- [x] Update `DispatchLocationInput.tsx` to subscribe to `getSpecialPlacesService()` and render `searchPlaces(inputValue)` suggestions (clean `name`/`shortName`) above Google Places predictions, matching `LocationAutocomplete.tsx`.
- [x] Fix `detectAirportInAddresses` in `app/core/config/airports.ts` so `Chesterfield Airport Rd` / `Chesterfield Airport Road` does not trigger `SUS` flight detection, and add/update a unit test if applicable.

## Verification
- `npm run typecheck`
- `npx vitest run app/core/config/airports.test.ts` (or targeted unit test for airport detection if present/added)
