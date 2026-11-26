# Phase 104: Flight Info Card Cleanup, Queue Badge Polish & Admin Terminal Pickup Locations

## Goal
Clean up the customer and dispatch flight info cards (removing redundant tracking/routing labels, narrowing the 4-digit flight number input, and simplifying commercial airport dropoffs into a compact optional airline-only card), replace `STL T1/T2` with flight origin in the Trips Queue badge while keeping row height uniform, sync checked luggage selection with at least 1 checked bag in Trip Details, and add structured Admin-editable terminal pickup locations (Terminal 1, Terminal 2, Private FBO) that propagate across the site.

## Design Decisions
- **Admin-Editable Terminal Pickup Locations (Single Source of Truth):**
  - Store `terminal1PickupLocation`, `terminal2PickupLocation`, and `privateFboPickupLocation` in `CustomerBookingConfig` (`AdminConfigService`) and derive `lambertPickupInstructions` as a combined fallback summary for backwards compatibility.
  - Update `resolveStlTerminalInfo` and downstream consumers (booking cards, confirmation screen, confirmation/dispatch emails, comms templates, and `flight-status.server.ts`) to read from the structured Admin config rather than hardcoded door strings.
- **Trips Queue Flight Badge & Row Height:**
  - `DispatchFlightTelemetryPill` uses non-bold, compact typography (`text-[10px] font-medium py-0 leading-tight`) and sits inline next to the pickup time in `TripQueueTableView` so rows with flight badges never expand taller than rows without them.
  - `resolveTripFlightBadge` displays `originIata` (e.g., `WN 1234 · ORD` or `ORD` in compact mode, `Landed · ORD` when landed) instead of `STL T1` / `STL T2` (since the arrival terminal is revealed in the flight tracking section). If no origin is set, display `${ident}` (or `Landed`).
- **Flight Info Card Cleanup & Simplified Airport Dropoffs:**
  - Remove the redundant `"Live Flight Tracking"`, `"Arrival Tracking"`, and `"Terminal Routing"` pill labels from customer and dispatch flight cards.
  - Resize commercial arrival input grids from `sm:grid-cols-3` to `sm:grid-cols-12` (`col-span-5` Airline, `col-span-2` Flight #, `col-span-5` Origin) so the 4-digit flight number input is compact and Airline/Origin have more horizontal room.
  - For commercial airport dropoffs (`isDropoffAirport && !isPickupAirport && !isPrivateAviation`), render a much smaller, lightweight container clearly marked **Optional** with **only** the Airline dropdown and resulting terminal door hint (no Flight #, Destination, live flight check, or Checked Baggage checkbox).
- **Checked Luggage Counter Sync:**
  - Checking `hasCheckedLuggage` (outbound or return, customer or dispatch) automatically sets `checkedBags` / `returnCheckedBags` to `Math.max(1, currentCount)` so Trip Details / Vehicle & Extras always reflects at least 1 checked bag.

## Files to Touch
- `app/core/types/config.ts` — Add `terminal1PickupLocation`, `terminal2PickupLocation`, and `privateFboPickupLocation` to `CustomerBookingConfig`.
- `app/core/services/config/admin-config.service.ts` — Add default terminal pickup location values and keep `lambertPickupInstructions` synced/derived.
- `app/core/config/airports.ts` — Support structured terminal pickup location overrides in `resolveStlTerminalInfo` (and helper to build combined STL instructions).
- `app/core/services/flight/flight-status.service.ts` — Update `resolveTripFlightBadge` to show `originIata` instead of `STL T1/T2`.
- `app/core/services/flight/flight-status.server.ts` — Use configured terminal pickup locations when building `pickupDoorGuidance`.
- `app/core/services/comms/comms-templates.service.ts` — Read terminal pickup locations from config instead of hardcoded Exit Door strings.
- `app/core/services/email/dispatch-email-catalog.ts` — Read terminal pickup locations from config instead of hardcoded Exit Door strings.
- `app/core/services/email/email-templates.ts` — Use configured terminal pickup locations in confirmation/dispatch email templates.
- `app/components/domain/admin/website/WebsiteFormControlsTab.tsx` — Replace/extend `lambertPickupInstructions` editor with 3 structured inputs (Terminal 1, Terminal 2, Private FBO).
- `app/components/domain/admin/AdminRulesTab.tsx` — Mirror structured terminal pickup location inputs in Admin Rules tab.
- `app/components/domain/BookingConfirmation.tsx` — Display configured terminal pickup instructions.
- `app/components/domain/booking/FlightAssistanceCard.tsx` — Remove `"Live Flight Tracking"`/`"Terminal Routing"` badge, narrow Flight # column (`sm:grid-cols-12`), and render compact optional Airline-only card for commercial airport dropoffs.
- `app/components/domain/booking/sections/CustomerRouteTimingSection.tsx` — Sync `hasCheckedLuggage` toggle to ensure `checkedBags >= 1`.
- `app/components/domain/booking/sections/CustomerReturnTripSection.tsx` — Sync `returnHasCheckedLuggage` toggle to ensure `returnCheckedBags >= 1`.
- `app/components/domain/dispatch/booking/DispatchRoutingTimingSection.tsx` — Remove `"Arrival Tracking"`/`"Terminal Routing"` badge, narrow Flight # column, simplify commercial airport dropoff card to compact optional Airline-only container, and sync `hasCheckedLuggage` → `checkedBags >= 1`.
- `app/components/domain/dispatch/booking/DispatchReturnRepeatSection.tsx` — Same cleanup, compact dropoff card, and return checked luggage → `returnCheckedBags >= 1` sync.
- `app/components/domain/dispatch/DispatchCascadeSlaBadges.tsx` — Make `DispatchFlightTelemetryPill` non-bold (`font-medium`) and compact (`text-[10px] py-0 leading-tight`).
- `app/components/domain/dispatch/queue/TripQueueTableView.tsx` — Place `DispatchFlightTelemetryPill` inline with pickup time (or fixed-height cell) so row height stays consistent across all rows.

## Tasks
- [ ] Add `terminal1PickupLocation`, `terminal2PickupLocation`, and `privateFboPickupLocation` to `CustomerBookingConfig` and `AdminConfigService` defaults, with helper to derive combined `lambertPickupInstructions`.
- [ ] Update `resolveStlTerminalInfo` in `airports.ts`, `flight-status.server.ts`, `comms-templates.service.ts`, `dispatch-email-catalog.ts`, `email-templates.ts`, and `BookingConfirmation.tsx` to consume configured terminal pickup locations.
- [ ] Add structured Terminal 1, Terminal 2, and Private FBO pickup location inputs in `WebsiteFormControlsTab.tsx` and `AdminRulesTab.tsx`.
- [ ] Update `resolveTripFlightBadge` in `flight-status.service.ts` to show flight `originIata` instead of `STL T1/T2`, and update `DispatchFlightTelemetryPill` + `TripQueueTableView.tsx` for non-bold compact styling and uniform row height.
- [ ] Clean up `FlightAssistanceCard.tsx`, `DispatchRoutingTimingSection.tsx`, and `DispatchReturnRepeatSection.tsx`: remove `"Live Flight Tracking"`/`"Arrival Tracking"`/`"Terminal Routing"` labels, narrow Flight # input (`sm:grid-cols-12`), and render a compact optional Airline-only container for commercial airport dropoffs.
- [ ] Sync `hasCheckedLuggage` / `returnHasCheckedLuggage` toggles in customer and dispatch booking sections so `checkedBags` / `returnCheckedBags` is at least `1` when checked luggage is selected.
- [ ] Run `npm run typecheck` and `npm run build` to verify zero TypeScript or build errors.

## Verification
- `npm run typecheck`
- `npm run build`
