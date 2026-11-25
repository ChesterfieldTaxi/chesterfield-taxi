# Phase 85: Corporate Account Archival

## Goal
Allow administrators to archive corporate accounts from the Corporate Directory, automatically blocking archived accounts from new bookings, public `/api/corporate/verify` checks, Dispatch selection, and Corporate Portal access while preserving historical trips, invoices, and analytics. Archived corporate accounts are surfaced in the Universal Archive (`Admin -> System & Governance -> Universal Archive`) for one-click restoration.

## Design Decisions
- **Entry Point:** Archiving is initiated from the Admin Corporate Directory (`Admin -> Customers -> Corporate Accounts`) via card/drawer actions, with a confirmation modal that warns if the account has open/overdue invoices or unbilled rides (allowing archival to proceed intentionally).
- **Hard Enforcement on New Activity:** Archived accounts are excluded from active selectors in Dispatch, Invoice Builder, Pricing Rules, Fare Simulator, and Corporate Portal, and are rejected by `/api/corporate/verify` and Corporate Portal booking/PO-rotation flows.
- **Historical Preservation:** Existing trips, invoices, AR balances, and B2B analytics remain intact and visible in Invoicing & Analytics.
- **Universal Archive Integration:** Add `'corporate_account'` to `GovernanceEntityType` and wire `AdminArchiveTab` to display and restore archived corporate accounts (clearing `isArchived`, `archivedAt`, `archiveReason`, and syncing to Firestore + `/corporateLookup`).

## Files to Touch
- `app/core/types/config.ts` — Add `isArchived?: boolean`, `archivedAt?: string`, `archiveReason?: string` to `CorporateAccountConfig`.
- `app/core/services/governance/universal-governance.service.ts` — Add `'corporate_account'` to `GovernanceEntityType`.
- `app/core/services/corporate-account.service.ts` — Add `isArchived` to `/corporateLookup/{hash}` sync in `syncIndividualAccountToFirestore`, plus domain helpers for archiving/restoring corporate accounts and checking open invoice / unbilled ride exposure.
- `app/core/services/corporate-portal.service.ts` — Exclude archived accounts from `listPortalCorporateAccounts` and reject portal bookings/PO rotations on archived accounts.
- `app/routes/api.corporate-verify.ts` — Reject verification when `lookupDoc.isArchived` is true.
- `app/components/domain/admin/customers/CorporateDirectoryPanel.tsx` — Filter out archived accounts from active directory view and add Archive action + confirmation modal with open-balance warning.
- `app/components/domain/admin/customers/CorporateAccountDirectoryDrawer.tsx` — Add Archive Account action in the edit drawer.
- `app/components/domain/admin/subpages/AdminCustomersSubpage.tsx` — Wire archive handler to persist `settings.corporateAccounts`, sync Firestore, and update `UniversalGovernanceService`.
- `app/components/domain/admin/AdminArchiveTab.tsx` — Load archived `settings.corporateAccounts`, add Corporate filter/badge/KPI, and implement `handleRestore` for `'corporate_account'`.
- `app/components/domain/dispatch/DispatchBookingEngine.tsx` — Filter out `isArchived` corporate accounts from dispatch selection.
- `app/components/domain/admin/invoicing/InvoiceBuilderModal.tsx` — Filter out `isArchived` corporate accounts from new invoice creation dropdown.
- `app/components/domain/admin/pricing/rules/PricingRulesPanel.tsx` — Filter out `isArchived` corporate accounts from pricing rule account selectors.
- `app/components/domain/admin/pricing/simulator/PersistentFareSimulator.tsx` — Filter out `isArchived` corporate accounts from fare simulator selectors.

## Tasks
- [x] Add `isArchived`, `archivedAt`, and `archiveReason` to `CorporateAccountConfig` in `app/core/types/config.ts` and add `'corporate_account'` to `GovernanceEntityType` in `app/core/services/governance/universal-governance.service.ts`.
- [x] Update `CorporateAccountService` (`app/core/services/corporate-account.service.ts`) to sync `isArchived` into `/corporateLookup/{hash}` and provide pure helpers for archive/restore state updates and open-balance/unbilled-ride checks.
- [x] Enforce archival blocks in `app/routes/api.corporate-verify.ts` (reject `lookupDoc.isArchived`) and `app/core/services/corporate-portal.service.ts` (exclude from active portal list and block new bookings/PO rotations).
- [x] Filter out `isArchived` accounts from active selectors in `DispatchBookingEngine.tsx`, `InvoiceBuilderModal.tsx`, `PricingRulesPanel.tsx`, and `PersistentFareSimulator.tsx` while keeping historical invoices/analytics intact.
- [x] Add Archive Account UI + open-balance warning confirmation in `CorporateDirectoryPanel.tsx` / `CorporateAccountDirectoryDrawer.tsx` and wire persistence in `AdminCustomersSubpage.tsx`.
- [x] Integrate `'corporate_account'` into `AdminArchiveTab.tsx` (load archived accounts from `settings.corporateAccounts`, add filter/KPI/badge, and implement `handleRestore` syncing both `settings` and Firestore).
- [x] Run verification commands and check off all completed tasks.

## Verification
- `npm run typecheck`
- `npm run build`
