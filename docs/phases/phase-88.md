# Phase 88: Decouple Unconfirmed Quick-Filter Pill from Status Dropdown

## Goal
Decouple the dedicated `Unconfirmed` quick-filter pill in the Dispatch Trips Queue toolbar from the multi-select `Status` dropdown so toggling the pill isolates unconfirmed trips without overwriting the dropdown's selection or duplicating `Unconfirmed` inside the dropdown when the pill is visible.

## Design Decisions
- **Hide `Unconfirmed` from Dropdown When Pill Is Visible:** Pass `showUnconfirmedOption={!tiers.showUnconfirmedPill}` (alongside `showTriggerUnconfirmedBadge={!tiers.showUnconfirmedPill}`) to `TripStatusMultiSelectDropdown`. On wide toolbars (`>= 560px` where `tiers.showUnconfirmedPill` is `true`), `Unconfirmed` is omitted from the dropdown menu; on narrow toolbars (`< 560px`), it remains inside the dropdown as the fallback quick-filter.
- **Independent Unconfirmed Quick-Filter State:** Track the `Unconfirmed` quick-filter independently from `statusFilter` (e.g., via `pillFilter === 'unconfirmed'` / `unconfirmedOnly` in `dispatch.tsx` and `filterDispatchQueueTrips`) rather than mutating `statusFilter` to `'unconfirmed'`.
- **Muted Status Dropdown While Pill Is Active:** When the dedicated `Unconfirmed` pill is toggled ON, the `Status` dropdown trigger keeps displaying its own selection (e.g., `Active Only` or `All Status`) in a visually muted state. Clicking any status option, `Select All`, or `Active Only` inside the dropdown automatically turns OFF the `Unconfirmed` pill and applies the selected `statusFilter`.
- **Default Queue Inclusion Preserved:** When the `Unconfirmed` pill is OFF and `statusFilter` is `Active Only` or `All Status`, unconfirmed trips continue to appear in the main queue (`ACTIVE_QUEUE_STATUS_KEYS` still includes `unconfirmed` and `pending`).
- **Narrow-Viewport Resize Fallback:** If `unconfirmedOnly` is active and the viewport resizes below `560px` (hiding the pill), the fallback `Unconfirmed` row inside `TripStatusMultiSelectDropdown` reflects the active state so the operator can still toggle it off.

## Files to Touch
- `app/core/hooks/dispatch/dispatch-workspace.util.ts` — Support independent `unconfirmedOnly` / `pillFilter === 'unconfirmed'` filtering in `filterDispatchQueueTrips` (bypassing `matchesQueueStatusFilter` only while the quick-filter is active, without mutating `statusFilter`).
- `app/routes/dispatch.tsx` — Wire the decoupled `unconfirmedOnly` / `pillFilter` state and pass toggle + clear callbacks to `TripQueueToolbar` (auto-clearing the `Unconfirmed` quick-filter when `onStatusFilterChange` is invoked from the dropdown).
- `app/components/domain/dispatch/queue/TripQueueToolbar.tsx` — Replace coupled `statusFilter`-mutating `handleToggleUnconfirmedQuickFilter` with the decoupled toggle prop, pass `showUnconfirmedOption={!tiers.showUnconfirmedPill}` and `isUnconfirmedQuickFilterActive` to `TripStatusMultiSelectDropdown`.
- `app/components/domain/dispatch/queue/TripQueueFilterPopovers.tsx` — Conditionally render the `Unconfirmed` menu item in `TripStatusMultiSelectDropdown` only when `showUnconfirmedOption` is `true`, style the trigger visually muted when the external `Unconfirmed` pill is active, and clear the external `Unconfirmed` pill when any dropdown status/preset is clicked.

## Tasks
- [x] Update `filterDispatchQueueTrips` in `app/core/hooks/dispatch/dispatch-workspace.util.ts` so an active `Unconfirmed` quick-filter (`pillFilter === 'unconfirmed'` or explicit `unconfirmedOnly` flag) isolates unconfirmed trips independently of `statusFilter`, while `Active Only` / `All Status` still include unconfirmed trips when the quick-filter is off.
- [x] Update `app/routes/dispatch.tsx` to pass the decoupled `Unconfirmed` quick-filter state/toggle to `TripQueueToolbar` and clear it automatically whenever `onStatusFilterChange` is called.
- [x] Update `TripStatusMultiSelectDropdown` in `app/components/domain/dispatch/queue/TripQueueFilterPopovers.tsx` to accept `showUnconfirmedOption` (hiding the `Unconfirmed` row when `tiers.showUnconfirmedPill` is `true`) and `isExternalUnconfirmedActive` (rendering the trigger visually muted while preserving its label, and clearing the external quick-filter on any dropdown selection).
- [x] Update `app/components/domain/dispatch/queue/TripQueueToolbar.tsx` to wire the decoupled `Unconfirmed` pill button and pass `showUnconfirmedOption={!tiers.showUnconfirmedPill}` and `isExternalUnconfirmedActive` to `TripStatusMultiSelectDropdown`.
- [ ] Verify behavior across wide (`>= 560px`) and narrow (`< 560px`) toolbar widths, including toggling the pill on/off, changing status dropdown options while the pill is active, and resizing across the `560px` threshold.

## Verification
- `npm run typecheck`
- `npm run build`
