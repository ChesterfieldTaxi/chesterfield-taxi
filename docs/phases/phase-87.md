# Phase 87: Sticky Profile Edit Controls & Admin Sidebar Client Profile Adaptation

## Goal
Pin the `Cancel` and `Save Profile` controls to a sticky bottom bar in `ClientProfileEditTab`, and adapt the Dispatch `ClientProfileWindow` experience into the Admin right-hand slide-over sidebar (`CustomerProfileDrawer`) with a 4-tab layout (`Profile`, `Trips`, `Places`, `Governance`). This gives Admin full CRM parity (multi-phone, saved payment methods, driver priority/exclusions, corporate billing, home/work addresses, mobility flags, places, and trip history) without duplicating UI or domain logic.

## Design Decisions
- **Sticky Bottom Action Bar (`ClientProfileEditTab`):** Make the `Cancel` and `Save Profile` footer sticky (`sticky bottom-0 z-10`) inside `ClientProfileEditTab.tsx` with a matching background and top border so it remains accessible while scrolling in both Dispatch (`FloatingWindow`) and Admin (`AdminSlideOverDrawer`).
- **4-Tab Admin Drawer (`CustomerProfileDrawer`):** Replace the legacy Admin edit/view form with a 4-tab bar: `Profile` (always opens on `Profile` by default in Admin), `Trips`, `Places`, and `Governance`.
- **Shared Component Reuse:** Reuse `ClientProfileHeaderCard`, `ClientProfileEditTab`, `ClientSavedPlacesSection`, `ClientUpcomingRidesStrip`, `resolveClientProfileData`, `partitionClientActiveUpcomingAndPastTrips`, and `paginateClientTrips` directly in `CustomerProfileDrawer` instead of duplicating form or trip-history logic.
- **Dispatch vs. Admin Context Adaptation:**
  - `Trips` tab: Show **Open in Dispatch** (`/dispatch?tripId=...`) or trip audit link instead of Dispatch's `Load into New Tab` / `Book Return` draft actions.
  - `Places` tab: Make `onSetEndpoint` optional on `ClientSavedPlacesSection` so Admin can view/manage saved addresses without Dispatch's `Set Pickup` / `Set Dropoff` booking buttons.
  - `Header Card`: Keep `Call` / `SMS` links (using `tel:` / `/dispatch?phone=...` or optional callbacks) appropriate for Admin context.
  - `Governance` tab: Retain Admin-only Blacklist/Unblacklist (with reason) and Purge Client actions via `getUniversalGovernanceService()`.

## Files to Touch
- `app/components/domain/dispatch/ClientProfileEditTab.tsx` — Make the `Cancel` / `Save Profile` action row sticky at the bottom of the scroll container.
- `app/components/domain/dispatch/ClientProfileSections.tsx` — Make `onSetEndpoint` optional on `ClientSavedPlacesSection` so Dispatch pickup/dropoff buttons are hidden when omitted in Admin.
- `app/components/domain/admin/customers/CustomerProfileDrawer.tsx` — Adapt into the 4-tab (`Profile`, `Trips`, `Places`, `Governance`) sidebar drawer reusing `ClientProfileHeaderCard`, `ClientProfileEditTab`, `ClientSavedPlacesSection`, `ClientUpcomingRidesStrip`, and shared client-trip utilities.
- `app/components/domain/admin/subpages/AdminCustomersSubpage.tsx` — Pass `trips`, `corporateAccounts` (`settings.corporateAccounts`), `vehicles` (`settings.vehicles`), and `drivers` (if available/loaded via operator service) into `CustomerProfileDrawer`.

## Tasks
- [x] Update `ClientProfileEditTab.tsx` so the `Cancel` and `Save Profile` button row uses `sticky bottom-0 z-10` with a clean background and top border (`bg-slate-50/95 backdrop-blur-xs border-t border-slate-200`).
- [x] Update `ClientSavedPlacesSection` in `ClientProfileSections.tsx` to make `onSetEndpoint` optional and conditionally render the `Set Pickup` / `Set Dropoff` buttons only when `onSetEndpoint` is provided.
- [x] Refactor `CustomerProfileDrawer.tsx` inside `AdminSlideOverDrawer` to render `ClientProfileHeaderCard` and the 4-tab switcher (`Profile`, `Trips`, `Places`, `Governance`), defaulting to `Profile` whenever a customer is opened or added.
- [x] Wire `Profile` tab to `ClientProfileEditTab` (handling new-client `cust_new_` creation and existing-client saves via `onCustomerSaved`), `Places` tab to `ClientSavedPlacesSection` (without `onSetEndpoint`), `Trips` tab to `ClientUpcomingRidesStrip` + paginated `Recent Trips` with an `Open in Dispatch` action, and `Governance` tab to existing Blacklist/Unblacklist and Purge Client controls.
- [x] Update `AdminCustomersSubpage.tsx` to pass `trips`, `corporateAccounts`, `vehicles`, and `drivers` to `CustomerProfileDrawer`.
- [ ] Verify existing Dispatch client profile tests and TypeScript compilation pass.

## Verification
- `npm run typecheck`
- `npx tsx scripts/test-call-hud-and-driver-prefs-phase74.ts`
- `npx tsx scripts/test-comms-profile-polish-phase73b.ts`
