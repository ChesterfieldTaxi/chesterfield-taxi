# Phase 80: Declutter Dispatch Queue Toolbar (Priority-Based Progressive Disclosure)

## Goal
Declutter the dispatch trip queue toolbar so it never overlaps or overflows narrow split-pane widths, while progressively revealing higher-priority controls inline when horizontal space is available. Core controls (Calendar, Status, Search, and `⋯` Overflow) always remain visible; wider panes progressively promote a dedicated `Unconfirmed` pill with counter, `Filter`, a single compact `Assignment ▾` dropdown (housing `Send / Hold`, `Auto-Stage Open`, and `Auto-Dispatch Ready`), and `Columns` in strict priority order—with generous width thresholds so resizing never clips the right edge.

## Design Decisions
- **Core Primary Bar (Always Visible):** Keep these four items on the `h-11` primary toolbar row (`min-w-0 overflow-hidden`):
  1. **Calendar (`All Dates v`)** — `shrink-0` `CustomDateTimePicker` trigger.
  2. **Status (`Active Only v`)** — `shrink-0` `TripStatusMultiSelectDropdown`. Pass `unconfirmedCount` so a tiny red dot/count badge renders on the Status trigger *only* when `unconfirmedCount > 0` AND the dedicated `Unconfirmed` pill is collapsed/hidden.
  3. **Always-Visible Capped Search** — `flex-1 min-w-[140px] max-w-[260px]` inline input (`MagnifyingGlassIcon`, clear `✕`, `/` & `Ctrl+K` shortcuts) so extra pane width is freed for priority items instead of stretching Search across the entire bar.
  4. **Overflow Menu (`⋯`)** — `shrink-0` `TripQueueOverflowMenu` portal popover button.
- **Compact `Assignment ▾` Dropdown (`TripQueueAssignmentDropdown`):**
  Instead of rendering 3 separate wide buttons (`Send | 📌 Hold`, `📌 Auto-Stage Open`, `⚡ Auto-Dispatch Ready`) inline, consolidate them into **one** compact `shrink-0` portal dropdown button (e.g., `Assign: Send ▾` or `Assign: Hold ▾`, with a small indigo/amber count badge when `openScheduledUnstagedCount > 0` or `readyAutoDispatchCount > 0`). Inside the popover:
  - **Queue Assign Mode:** `Send` (immediate) vs `📌 Hold` (stage in Dispatch) segmented toggle.
  - **Auto-Stage Open (`N`):** `📌 Auto-Stage Open (N)` trigger button (when `stagedPlanner && openScheduledUnstagedCount > 0`).
  - **Auto-Dispatch Ready (`N`):** `⚡ Auto-Dispatch Ready (N)` sweep button (when `readyAutoDispatchCount > 0 && onRunAutoDispatchSweep`).
- **Priority-Based Progressive Inline Tiers (Width-Driven, Zero-Clip):**
  Use `queueWidthPx` (with a `ResizeObserver` fallback on the toolbar container when `queueWidthPx` is unset) and a config-driven threshold table in `trip-queue-layout.util.ts` with conservative pixel budgets (accounting for `min-w-[140px]` Search + `⋯` + padding) so resizing never causes mid-transition clipping:
  1. **Tier 1 (`>= 560px`): Dedicated `Unconfirmed` Pill with Counter** — compact toggle pill next to Status. When visible inline, hide the redundant unconfirmed count badge on the Status trigger.
  2. **Tier 2 (`>= 680px`): `Filter`** — `TripAddFilterDropdown` inline.
  3. **Tier 3 (`>= 840px`): `Assignment ▾` Dropdown** — `TripQueueAssignmentDropdown` inline (when `stagedPlanner` or `readyAutoDispatchCount > 0` is available).
  4. **Tier 4 (`>= 980px`): `Columns`** — `TripQueueColumnsDropdown` (when Table or Auto layout is active).
- **Zero-Duplication `⋯` Overflow Popover (`TripQueueOverflowMenu`):** Pass visibility flags (`showFiltersInMenu`, `showAssignmentInMenu`, `showColumnsInMenu`) so controls currently promoted inline are omitted from the `⋯` popover, leaving only collapsed items + `View / Layout` + `Displaying X trips` summary.
- **Conditional Active Filter Pills Sub-Row:** Render active filter pills (`Driver`, `Vehicle`, `Company`, `Payment`, `Tariff`, `Has Car Seat`, `Has Stops`, `Staged Only`, plus `Clear All`) in a compact secondary strip below the primary toolbar **only** when `activeFilterKeys.length > 0`.
- **Architecture:** Pure UI/layout refactor within `app/components/domain/dispatch/queue/`—no domain logic in UI components, preserving all existing props and callbacks on `TripQueueToolbarProps`.

## Files to Touch
- `app/components/domain/dispatch/queue/trip-queue-layout.util.ts` — Add config-driven toolbar priority tier width thresholds (`>= 560`, `>= 680`, `>= 840`, `>= 980`) and helper to compute which tiers fit for a given width without clipping.
- `app/components/domain/dispatch/queue/TripQueueFilterPopovers.tsx` — Add `TripQueueAssignmentDropdown` (portal popover using `usePortalDropdownPosition` for `Send | 📌 Hold`, `Auto-Stage Open`, and `Auto-Dispatch Ready`) and ensure `TripStatusMultiSelectDropdown` supports hiding its trigger unconfirmed badge when Tier 1 is visible inline.
- `app/components/domain/dispatch/queue/TripQueueToolbar.tsx` — Cap Search (`min-w-[140px] max-w-[260px]`), resolve toolbar width (`queueWidthPx` + `ResizeObserver` fallback), progressively render Tier 1 (`Unconfirmed` pill), Tier 2 (`Filter`), Tier 3 (`TripQueueAssignmentDropdown`), and Tier 4 (`Columns`) in priority order, and pass visibility flags to `TripQueueOverflowMenu`.
- `app/components/domain/dispatch/queue/TripQueueOverflowMenu.tsx` — Accept visibility flags (`showFiltersInMenu`, `showAssignmentInMenu`, `showColumnsInMenu`) so inline-promoted controls are not duplicated inside the `⋯` popover.

## Tasks
- [x] Update `TripStatusMultiSelectDropdown` in `TripQueueFilterPopovers.tsx` to render a compact red dot/count badge on the Status trigger button when `unconfirmedCount > 0` and include an `Unconfirmed` quick-filter row inside the dropdown.
- [x] Create `TripQueueOverflowMenu` (using `usePortalDropdownPosition`) housing Filters, View & Columns, conditional Staging/Auto-Dispatch controls, and the `Displaying X trips` count.
- [x] Refactor the primary toolbar row in `TripQueueToolbar.tsx` to `min-w-0 overflow-hidden` containing Calendar, Status, always-visible flexible Search, and the `⋯` Overflow trigger.
- [x] Render active filter pills in a conditional sub-row below the primary toolbar only when `activeFilterKeys.length > 0`.
- [x] Add config-driven priority tier width thresholds in `trip-queue-layout.util.ts` (`>= 560px` Unconfirmed pill, `>= 680px` Filter, `>= 840px` Assignment dropdown, `>= 980px` Columns).
- [x] Create `TripQueueAssignmentDropdown` in `TripQueueFilterPopovers.tsx` consolidating `Send | 📌 Hold`, `📌 Auto-Stage Open (N)`, and `⚡ Auto-Dispatch Ready (N)` into a single compact `Assign: Send/Hold ▾` trigger + portal popover.
- [x] Update `TripQueueToolbar.tsx` to cap Search (`min-w-[140px] max-w-[260px]`), measure available toolbar width (`queueWidthPx` + `ResizeObserver` fallback), progressively render Tiers 1–4 inline without clipping, and hide the Status trigger's unconfirmed badge when Tier 1 is visible.
- [x] Update `TripQueueOverflowMenu.tsx` to accept `showFiltersInMenu`, `showAssignmentInMenu`, and `showColumnsInMenu` so inline-promoted controls are omitted from `⋯`.
- [x] Verify smooth resizing across narrow split-pane and full-width layouts with zero clipping or overflow, and run `npm run typecheck` and `npm run build`.

## Verification
- `npm run typecheck`
- `npm run build`
