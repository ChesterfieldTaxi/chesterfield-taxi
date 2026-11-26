# Phase 102: Separate Passengers & Corporate Admin Pages, Shared Streamlined Header & Table Default

## Goal
Split the Admin Console's combined Clients & Corporate section into two first-class top-level Admin pages (`passengers` and `corporate`), unify both directories behind a single-row config-driven header toolbar, and make the Table view the default for both Passengers and Corporate.

## Design Decisions
- **Separate Top-Level Admin Pages:** Replace the `'customers'` primary tab with `'passengers'` (**Passengers**) and `'corporate'` (**Corporate**) under **Clients, Billing & Fleet** in `AdminSidebar` and `admin-nav.util.ts`. Preserve `?tab=customers` (including `&sub=directory` and `&sub=corporate`) as legacy aliases in `resolveAdminTabAndSub` so existing bookmarks and deep links continue to work.
- **Shared Single-Row Streamlined Header (`DirectoryToolbar`):** Extract a config-driven toolbar component shared by both `PassengerDirectoryPanel` and `CorporateDirectoryPanel`. On desktop (`xl:`), search, status/filter pills, compact quick-toggle (e.g. `VIP (n)`), sort selector, `Table | Cards` toggle, and primary/secondary action buttons sit on a single clean row without awkward wrapping, while stacking cleanly on smaller screens.
- **Table View Default for Both Directories:** Default `viewMode` to `'table'` in `PassengerDirectoryPanel` and add `Table | Cards` view switching (defaulting to `'table'`) + sorting to `CorporateDirectoryPanel` via a new config-driven `CorporateDirectoryTable` component.
- **Corporate Governance Card:** Keep `CorporateGovernanceCard` at the top of the Corporate page above the shared directory toolbar and table.

## Files to Touch
- `app/core/utils/admin-nav.util.ts` — split `'customers'` into `'passengers'` and `'corporate'` in `AdminPrimaryTabKey`, `SUB_PAGES`, and `CANONICAL_ADMIN_TABS`; keep `'customers'` as a legacy alias in `resolveAdminTabAndSub` mapping `sub=corporate` -> `corporate` and default/other -> `passengers`.
- `app/components/domain/admin/navigation/AdminSidebar.tsx` — replace the single `customers` nav item with separate `passengers` (**Passengers**) and `corporate` (**Corporate**) items under **Clients, Billing & Fleet**.
- `app/routes/admin.tsx` — update tab rendering (`normalizedTab === 'passengers'` and `normalizedTab === 'corporate'`), mobile bottom bar / more-menu tab checks, and any `customers` references.
- `app/components/domain/admin/subpages/AdminCustomersSubpage.tsx` — accept a `mode: 'passengers' | 'corporate'` prop (or split cleanly) so each page renders only its directory and relevant drawers/modals without an internal sub-tab switcher.
- `app/components/domain/admin/customers/types.ts` — add shared `DirectoryToolbar` config types and corporate sort/table column types.
- `app/components/domain/admin/customers/customer-directory.util.ts` — add corporate sort options, `CORPORATE_TABLE_COLUMNS`, `CORPORATE_VIEW_STORAGE_KEY`, and `filterAndSortCorporateAccounts` helper.
- `app/components/domain/admin/customers/DirectoryToolbar.tsx` — *(new)* config-driven single-row directory header toolbar used by both Passengers and Corporate.
- `app/components/domain/admin/customers/CorporateDirectoryTable.tsx` — *(new)* config-driven table view for corporate accounts (Company/Account, PO Policy & Prefix, Riders/Locations/Managers, Actions).
- `app/components/domain/admin/customers/PassengerDirectoryPanel.tsx` — replace inline toolbar JSX with `DirectoryToolbar` and change default `viewMode` from `'cards'` to `'table'`.
- `app/components/domain/admin/customers/CorporateDirectoryPanel.tsx` — replace inline toolbar JSX with `DirectoryToolbar`, add sort + `Table | Cards` toggle (default `'table'`), and render `CorporateDirectoryTable` when in table mode.
- `app/components/domain/admin/customers/index.ts` — export `DirectoryToolbar` and `CorporateDirectoryTable`.

## Tasks
- [x] Update `app/core/utils/admin-nav.util.ts`, `app/components/domain/admin/navigation/AdminSidebar.tsx`, and `app/routes/admin.tsx` to separate `passengers` and `corporate` into distinct top-level Admin pages while preserving `?tab=customers` legacy resolution.
- [x] Update `app/components/domain/admin/subpages/AdminCustomersSubpage.tsx` to render standalone `passengers` and `corporate` page modes without the internal sub-tab switcher.
- [x] Add shared toolbar types, corporate sort/column configs, and `filterAndSortCorporateAccounts` in `app/components/domain/admin/customers/types.ts` and `app/components/domain/admin/customers/customer-directory.util.ts`.
- [x] Create `app/components/domain/admin/customers/DirectoryToolbar.tsx` as a config-driven, single-row-on-desktop header toolbar (search, status pills, optional quick-toggle chip, sort dropdown, `Table | Cards` toggle, and action buttons).
- [x] Create `app/components/domain/admin/customers/CorporateDirectoryTable.tsx` with sortable headers and corporate row actions (Edit, Provision Managers, PO Toggle/Regenerate/History/PIN, Archive).
- [x] Wire `DirectoryToolbar` and default `viewMode = 'table'` into `PassengerDirectoryPanel.tsx` and `CorporateDirectoryPanel.tsx` (rendering `CorporateDirectoryTable` in table mode and keeping `CorporateGovernanceCard` at the top of Corporate), and update `customers/index.ts`.
- [x] Run `npm run typecheck` and `npm run build` to verify zero TypeScript or SSR/bundle errors.

## Verification
- `npm run typecheck`
- `npm run build`
