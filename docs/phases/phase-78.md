# Phase 78: Assignment Dropdown Status & Time-to-Pickup Color Coding

## Goal
Color-code `DriverAssignDropdown` across all Dispatch and Admin views based on trip assignment/offer/stage status and configurable time-to-pickup urgency, with automatic 1-minute updates and airport flight-tracking pickup time support.

## Design Decisions
- **Dropdown Color & Status Matrix:**
  - **Staged** (`stage_hold` / `hasStaged`): White background with black border (`bg-white text-slate-900 border-slate-900`).
  - **Offered** (`status === 'offered'` / active auto-offer cascade): Purple (`bg-purple-50 text-purple-900 border-purple-400`).
  - **Assigned** (`assigned`, `en_route`, `arrived`, `in_progress`, `completed`): Green (`bg-emerald-50 text-emerald-900 border-emerald-400`), staying green through the trip lifecycle — **unless** a scheduled trip's driver is late (still in `assigned` or `en_route`, not yet `arrived`/`in_progress`, and `nowMs > effectivePickupMs`), in which case **Red** (`bg-rose-50 text-rose-800 border-rose-400`).
  - **Unassigned Scheduled** (`pending`, `CONFIRMED`, `UNCONFIRMED`, etc.):
    - Default (`> slaWarningMinutes`): **Blue** (`bg-blue-50/90 text-blue-800 border-blue-300`).
    - Warning (`<= slaWarningMinutes`, default `60m`): **Orange** (`bg-amber-50 text-amber-900 border-amber-400`).
    - Critical / Overdue (`<= slaCriticalMinutes`, default `15m`, or `<= 0m`): **Red** (`bg-rose-50 text-rose-800 border-rose-400`).
  - **ASAP Trips** (`bookingType === 'asap'`):
    - Unassigned: **Orange** for the first `asapUnassignedGraceMinutes` (default `15m`) from `createdAt`, then **Red** until assigned.
    - Assigned: **Green** (no late-driver red status for ASAP trips).
- **Airport Flight-Tracking Effective Pickup Time:**
  - For airport pickups (`detectAirportInAddresses` or `trip.metadata?.isAirportTrip`), if `trip.flightTelemetry?.estimatedArrivalIso` (or `scheduledArrivalIso`) is present, compute `effectivePickupMs = Date.parse(arrivalIso) + airportPickupBufferMinutes * 60_000` (default `30m` admin-configurable buffer). Otherwise fall back to `trip.scheduledPickupTime`.
- **Config-Driven & Pure Service Architecture (`constitution.md`):**
  - Add `airportPickupBufferMinutes` (default `30`) and `asapUnassignedGraceMinutes` (default `15`), and align default `slaCriticalMinutes` to `15` (keeping `slaWarningMinutes: 60`) in `DispatchAutomationConfig` (`app/core/types/config.ts`).
  - Implement pure, React-free `resolveAssignmentDropdownTone(trip, config, nowMs)` in `app/core/services/dispatch/assignment-urgency.service.ts`.
  - Map resolved tones via a static config lookup table in `DriverAssignDropdown.tsx` with a 60-second `setInterval` tick so all dropdowns re-evaluate automatically every minute without extra Firestore reads.

## Files to Touch
- `app/core/types/config.ts` — Add `airportPickupBufferMinutes` (default `30`) and `asapUnassignedGraceMinutes` (default `15`), and set default `slaCriticalMinutes` to `15` in `DispatchAutomationConfig` and `normalizeDispatchAutomationConfig`.
- `app/core/services/dispatch/assignment-urgency.service.ts` — Create pure domain service exporting `AssignmentDropdownTone`, `AssignmentToneResolution`, `resolveEffectivePickupMs`, and `resolveAssignmentDropdownTone`.
- `app/components/domain/admin/rules/DispatchConsoleSettingsPanel.tsx` — Add admin inputs for `airportPickupBufferMinutes` and `asapUnassignedGraceMinutes`.
- `app/components/domain/admin/rules/AdminAutoDispatchControlPanel.tsx` — Add admin inputs for `airportPickupBufferMinutes` and `asapUnassignedGraceMinutes` (and update critical placeholder/fallback to `15`).
- `app/components/domain/dispatch/queue/DriverAssignDropdown.tsx` — Accept optional `trip` (or status/timing metadata) and `slaConfig`, run a 60-second auto-refresh tick, and apply the config-driven tone class map.
- `app/components/domain/dispatch/queue/TripQueueTableView.tsx` — Pass `trip` and `dispatchAutomation` config to `DriverAssignDropdown`.
- `app/components/domain/dispatch/queue/TripQueueCardsGrid.tsx` — Pass `trip` and `dispatchAutomation` config to `DriverAssignDropdown`.
- `app/components/domain/dispatch/queue/TripQueueCompactList.tsx` — Pass `trip` and `dispatchAutomation` config to `DriverAssignDropdown`.
- `app/components/domain/dispatch/drawer/TripDrawerOverviewSection.tsx` — Pass `trip` and `dispatchAutomation` config to `DriverAssignDropdown`.
- `app/components/domain/dispatch/StandingOrdersDrawer.tsx` — Pass `trip` and `dispatchAutomation` config to `DriverAssignDropdown`.
- `app/components/domain/dispatch/workspace/DispatchLeftBookingSidebar.tsx` — Pass `trip` / draft context and `dispatchAutomation` config to `DriverAssignDropdown`.
- `app/components/domain/dispatch/booking/DispatchPaymentAssignmentSection.tsx` — Pass `trip` / draft context and `dispatchAutomation` config to `DriverAssignDropdown`.
- `app/components/domain/admin/trips/AdminTripsTablePanel.tsx` — Pass `trip` and `dispatchAutomation` config to `DriverAssignDropdown`.
- `app/components/domain/admin/trips/AdminTripsExceptionsPanel.tsx` — Pass `trip` and `dispatchAutomation` config to `DriverAssignDropdown`.
- `app/components/domain/admin/trips/AdminTripDetailsSlideOver.tsx` — Pass `trip` and `dispatchAutomation` config to `DriverAssignDropdown`.
- `scripts/test-assignment-urgency.ts` — Unit test script covering scheduled urgency, ASAP grace window, airport flight-tracking + buffer, staged, offered, assigned lifecycle, and late-driver red state.

## Tasks
- [x] Extend `DispatchAutomationConfig`, `DEFAULT_DISPATCH_AUTOMATION_CONFIG`, and `normalizeDispatchAutomationConfig` in `app/core/types/config.ts` with `airportPickupBufferMinutes` (default `30`, clamped `0..180`), `asapUnassignedGraceMinutes` (default `15`, clamped `1..120`), and default `slaCriticalMinutes: 15`.
- [x] Create `app/core/services/dispatch/assignment-urgency.service.ts` with `resolveEffectivePickupMs` (handling `flightTelemetry.estimatedArrivalIso` / `scheduledArrivalIso` + `airportPickupBufferMinutes`, else `scheduledPickupTime`) and `resolveAssignmentDropdownTone` covering staged, offered, assigned (green + scheduled late-driver red), unassigned scheduled (blue/orange/red), and ASAP (orange <= grace, then red; green when assigned).
- [x] Expose `airportPickupBufferMinutes` and `asapUnassignedGraceMinutes` in `DispatchConsoleSettingsPanel.tsx` and `AdminAutoDispatchControlPanel.tsx`.
- [x] Update `DriverAssignDropdown.tsx` with `trip` / `slaConfig` props, a 60-second `nowMs` interval tick, and a static `ASSIGNMENT_TONE_CLASSES` map for all tones (`staged_white`, `offered_purple`, `assigned_green`, `unassigned_blue`, `warning_orange`, `critical_red`).
- [x] Wire `trip` and `dispatchAutomation` config into every `DriverAssignDropdown` call site across Dispatch (`TripQueueTableView`, `TripQueueCardsGrid`, `TripQueueCompactList`, `TripDrawerOverviewSection`, `StandingOrdersDrawer`, `DispatchLeftBookingSidebar`, `DispatchPaymentAssignmentSection`) and Admin (`AdminTripsTablePanel`, `AdminTripsExceptionsPanel`, `AdminTripDetailsSlideOver`).
- [x] Add unit tests in `scripts/test-assignment-urgency.ts` and verify all assertions and typecheck pass.

## Verification
- `npm run typecheck`
- `npx tsx scripts/test-assignment-urgency.ts`
