# Phase 108: Dispatch Vehicle Selector Redesign & Strict Admin Tier Column Display

## Goal
Redesign the dispatch booking form's Vehicles section (and its duplicated Return Vehicles counterpart) so it scales cleanly beyond 4 Admin-configured vehicle tiers without overflowing, while preserving the `+ Add Vehicle` per-row selection workflow. Additionally, update `formatTripVehicleColumnDisplay` so that assigned `'any'` trips only display `Any → <Admin Tier Name>` when the assigned vehicle resolves to a configured Admin `VehicleTierConfig`, otherwise falling back cleanly to `'Any'` with no hardcoded `'Sedan'`/`'Standard Sedan'` labels.

## Design Decisions
- **Shared Config-Driven Component:** Extract a single reusable `DispatchVehicleSelectorList` component consumed by both `DispatchExtrasVehicleSection.tsx` (Outbound) and `DispatchReturnRepeatSection.tsx` (Return), eliminating duplicated vehicle-row JSX and preserving strict separation between configuration/data (`dispatchVehicleOptions`, `vehicleCapacities`, `vehicleQuotes`) and UI.
- **Compact Row Trigger + Popover Dropdown:** Keep the `+ Add Vehicle` button, `#1` / `#2` row numbering, and `✕` remove button (when `vehicles.length > 1`). Replace each row's inline `flex-wrap` pill bar with a compact trigger button showing the selected vehicle's name, passenger capacity `(Xp)`, and live quote (`$XX`), opening a popover menu listing all `dispatchVehicleOptions` with capacity `(Xp / Yb)`, live price, selected state, and capacity-insufficient disabled state + tooltip.
- **Popover Interaction:** Support click-outside and `Escape` key dismissal, disabled state when `isCompleted || isCancelled` (for outbound), and accent color variants (`blue` for outbound, `indigo` for return) so both sections retain their visual hierarchy.
- **Strict Admin Tier Resolution for `Any` Assignments:** In `formatTripVehicleColumnDisplay` (`app/core/utils/vehicle-tier-format.util.ts`), when a trip was booked as `'any'` (`wasBookedAsAny`) and a driver is assigned, validate the resolved assigned vehicle/driver tier strictly against Admin-configured `VehicleTierConfig[]` via `findLiveVehicleTier`. If no matching Admin tier exists, return `'Any'` instead of calling `formatVehicleTierDisplay`'s hardcoded fallbacks (`'Sedan'`, `'Standard Sedan'`, `'Full-Size SUV (XL)'`, etc.).

## Files to Touch
- `app/components/domain/dispatch/booking/DispatchVehicleSelectorList.tsx` — New shared config-driven component rendering the `Vehicles (N)` header, `+ Add Vehicle` button, and per-row compact trigger + popover dropdown.
- `app/components/domain/dispatch/booking/DispatchExtrasVehicleSection.tsx` — Replace the inline `flex-wrap` vehicle pill block (lines 679–764) with `<DispatchVehicleSelectorList />`.
- `app/components/domain/dispatch/booking/DispatchReturnRepeatSection.tsx` — Replace the duplicated return vehicles pill block (lines 1107–1186) with `<DispatchVehicleSelectorList />`.
- `app/core/utils/vehicle-tier-format.util.ts` — Update `formatTripVehicleColumnDisplay` so assigned `'any'` bookings strictly resolve against Admin `VehicleTierConfig[]` (`findLiveVehicleTier`) and return `'Any'` when the assigned vehicle is not in a configured tier.

## Tasks
- [x] Create `app/components/domain/dispatch/booking/DispatchVehicleSelectorList.tsx` accepting `vehicles`, `dispatchVehicleOptions`, `vehicleCapacities`, `activeAdminVehicleIds`, `vehicleQuotes`, `passengers`, `disabled` (`isCompleted || isCancelled`), `title` (e.g. `Vehicles` / `Return Vehicles`), `accent` (`'blue' | 'indigo'`), `onAddVehicle`, `onRemoveVehicle`, and `onUpdateVehicleChoice`.
- [x] Implement the compact row trigger + popover dropdown in `DispatchVehicleSelectorList.tsx` with outside-click / `Escape` dismissal, live `$XX` quote display, `(Xp / Yb)` capacity labels, and capacity-insufficient disabled state + tooltip.
- [x] Replace the inline vehicles selector in `app/components/domain/dispatch/booking/DispatchExtrasVehicleSection.tsx` with `DispatchVehicleSelectorList`.
- [x] Replace the inline return vehicles selector in `app/components/domain/dispatch/booking/DispatchReturnRepeatSection.tsx` with `DispatchVehicleSelectorList` (using `indigo` accent).
- [x] Update `formatTripVehicleColumnDisplay` in `app/core/utils/vehicle-tier-format.util.ts` so `wasBookedAsAny` + assigned driver uses `findLiveVehicleTier(resolvedToken, vehicles)` (and only falls back to `'Any'` when no Admin `VehicleTierConfig` matches—never hardcoded `'Sedan'` or legacy tier labels).
- [x] Run `npm run typecheck` and `npm run build` to verify TypeScript types and production bundle compilation.

## Verification
- `npm run typecheck`
- `npm run build`
