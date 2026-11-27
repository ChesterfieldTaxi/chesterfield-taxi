# Phase 109: Scope Auto-Stage to Selected Trips

## Goal
Scope the Auto-Stage action in the dispatch queue Assignment dropdown and Overflow menu so it only evaluates and stages currently selected trips, rather than all open scheduled trips in the queue.

## Design Decisions
- **Selection-Scoped Eligibility:** Keep the existing auto-stage eligibility rules (unassigned, unstaged, non-archived, non-blacklisted, valid `scheduledPickupTime`, status in `['CONFIRMED', 'confirmed', 'accepted', 'pending']`), applied strictly to `selectedTrips` instead of `filteredTrips`.
- **Full Timeline Conflict Checking:** Continue passing `allTrips: trips` to `computeAutoStageSuggestions({ trips: selectedTrips, allTrips: trips, drivers, settings })` so suggested shift placements still avoid `< 15m` turnaround conflicts against all assigned and staged trips across the fleet.
- **Hide When Zero Eligible Selected:** When `selectedScheduledUnstagedCount === 0`, hide the Auto-Stage button from `TripQueueAssignmentDropdown` and `TripQueueOverflowMenu` and exclude it from the Assignment trigger badge count (matching current behavior when count is `0`).
- **Clear Selection on Apply:** After `confirmApplyAutoStageSuggestions` applies staged assignments, clear `selectedTripIds` (`setSelectedTripIds([])`) to match batch assign behavior.

## Files to Touch
- `app/core/hooks/dispatch/useDispatchStagedPlanner.ts` — Add `selectedScheduledUnstagedCount` to `DispatchStagedPlannerController`, scope `openAutoStagePreview()` to `selectedTrips` (with `allTrips: trips`), and clear `selectedTripIds` in `confirmApplyAutoStageSuggestions()`.
- `app/components/domain/dispatch/queue/TripQueueFilterPopovers.tsx` — Update `TripQueueAssignmentDropdown` to use `selectedScheduledUnstagedCount` for `hasAutoStageReady` and `totalActionCount`, and change the button label to `📌 Auto-Stage Selected (${count})`.
- `app/components/domain/dispatch/queue/TripQueueOverflowMenu.tsx` — Update the consolidated overflow menu's Auto-Stage button and `hasAutoStageReady` check to use `selectedScheduledUnstagedCount` and label `📌 Auto-Stage Selected (${count})`.
- `app/components/domain/dispatch/StagedDriverConflictModal.tsx` — Review `AutoStageSuggestionsModal` copy/empty-state text and update any "open trips" wording if needed to reflect selected trips.

## Tasks
- [x] In `app/core/hooks/dispatch/useDispatchStagedPlanner.ts`, add `selectedScheduledUnstagedCount` (filtering `selectedTrips` for unassigned, unstaged, non-archived, non-blacklisted scheduled trips with eligible status) and expose it on `DispatchStagedPlannerController`.
- [x] Update `openAutoStagePreview()` in `useDispatchStagedPlanner.ts` to early-return when `selectedScheduledUnstagedCount === 0` and pass `trips: selectedTrips` (keeping `allTrips: trips`) to `computeAutoStageSuggestions`.
- [x] Update `confirmApplyAutoStageSuggestions()` in `useDispatchStagedPlanner.ts` to clear `selectedTripIds` (`setSelectedTripIds([])`) after applying suggestions.
- [x] Update `TripQueueAssignmentDropdown` in `app/components/domain/dispatch/queue/TripQueueFilterPopovers.tsx` to read `selectedScheduledUnstagedCount`, hide the Auto-Stage button when `0`, and label it `📌 Auto-Stage Selected (${count})`.
- [x] Update `TripQueueOverflowMenu` in `app/components/domain/dispatch/queue/TripQueueOverflowMenu.tsx` to read `selectedScheduledUnstagedCount`, hide the Auto-Stage button when `0`, and label it `📌 Auto-Stage Selected (${count})`.
- [x] Check `AutoStageSuggestionsModal` in `app/components/domain/dispatch/StagedDriverConflictModal.tsx` and update any copy that assumes all open queue trips rather than selected trips.

## Verification
- `npm run typecheck`
- `npx tsx scripts/test-staged-driver-planner.ts`
