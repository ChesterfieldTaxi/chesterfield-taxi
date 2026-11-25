# Phase 86: Passenger Directory Blacklist Tab & Purge

## Goal
Move blacklisted passengers out of the standard Passenger Directory views into a dedicated **Blacklist** filter tab (`Active | Archived | Blacklist | All`), and provide individual and bulk **Purge** actions (alongside **Restore / Unblacklist**) that remove saved contact PII and blacklist/governance state while preserving the historical trip ledger.

## Design Decisions
- **Directory Filter Tab:** Extend `CustomerArchiveFilter` in `PassengerDirectoryPanel` to `'active' | 'archived' | 'blacklist' | 'all'`. `Active`, `Archived`, and `All` exclude blacklisted passengers (`!c.isBlacklisted`), while `Blacklist` displays only `Boolean(c.isBlacklisted)` passengers.
- **Purge Semantics (Preserve Trip Ledger):** Purging a blacklisted passenger deletes their saved contact record from `ContactService` (including Firestore cleanup if persisted) and clears `isBlacklisted` / `blacklistReason` in `UniversalGovernanceService`, while setting an `isPurged: true` (`purgedAt`) tombstone on the `customerGovernance` record(s) for their email/phone. This prevents `buildCustomerProfilesList` from re-synthesizing a guest entry from historical trips while keeping all trip/invoice records intact.
- **Actions in Blacklist Tab:** Each blacklisted passenger supports **Restore** (lifts blacklist) and **Purge** (with confirmation). When the `Blacklist` tab is active, the toolbar offers a **Purge All Blacklisted** bulk action (with confirmation). `CustomerProfileDrawer` also exposes **Purge** for blacklisted profiles.
- **Strict Abstraction:** All governance/contact purge mutations and audit logging stay inside `UniversalGovernanceService` and `ContactService`; UI components only invoke service methods and refresh state.

## Files to Touch
- `app/core/services/governance/universal-governance.service.ts` — Add `isPurged?: boolean` and `purgedAt?: string` to `EntityGovernanceRecord`; include `isPurged` in `isPassengerBlacklistedSync` (and async check if applicable); add `purgePassenger` and `purgeAllBlacklistedPassengers` methods with Firestore + localStorage persistence and `GOVERNANCE_STATUS_CHANGED` audit logging.
- `app/core/services/customer/contact.service.ts` — Verify/ensure `deleteContact` cleans up both local cache/indexes and Firestore `contacts` document if persisted.
- `app/components/domain/admin/customers/types.ts` — Extend `CustomerArchiveFilter` to `'active' | 'archived' | 'blacklist' | 'all'`.
- `app/components/domain/admin/customers/customer-directory.util.ts` — Filter out passengers with `isPurged` in `buildCustomerProfilesList`.
- `app/components/domain/admin/customers/PassengerDirectoryPanel.tsx` — Add the `Blacklist (N)` tab button, `Purge All Blacklisted` toolbar button (with confirmation), and per-row `Restore` and `Purge` buttons (with confirmation) when viewing blacklisted passengers.
- `app/components/domain/admin/customers/CustomerProfileDrawer.tsx` — Add a `Purge` action (with confirmation) for blacklisted profiles alongside `Restore Client`.
- `app/components/domain/admin/subpages/AdminCustomersSubpage.tsx` — Partition `activeCustomers`, `archivedCustomers`, `blacklistedCustomers`, and `nonBlacklistedCustomers` (`all`), and wire `onRestoreCustomer`, `onPurgeCustomer`, and `onPurgeAllBlacklisted` handlers.

## Tasks
- [x] Update `EntityGovernanceRecord` and `isPassengerBlacklistedSync` in `app/core/services/governance/universal-governance.service.ts` to track `isPurged` / `purgedAt`, and implement `purgePassenger` and `purgeAllBlacklistedPassengers` (clearing `isBlacklisted`/`blacklistReason`, setting `isPurged: true`, persisting to localStorage + Firestore `customerGovernance`, and logging a security audit event).
- [x] Ensure `deleteContact` in `app/core/services/customer/contact.service.ts` removes the contact from both local indexes/storage and Firestore (if configured/persisted).
- [x] Update `CustomerArchiveFilter` in `app/components/domain/admin/customers/types.ts` to include `'blacklist'`.
- [x] Update `buildCustomerProfilesList` in `app/components/domain/admin/customers/customer-directory.util.ts` to exclude purged passengers (`gov.isPurged`).
- [x] Update `AdminCustomersSubpage.tsx` to exclude blacklisted passengers from `active`, `archived`, and `all` filters, pass `blacklistCount` and `blacklistedCustomers` to `PassengerDirectoryPanel`, and implement `onRestoreCustomer`, `onPurgeCustomer`, and `onPurgeAllBlacklisted` handlers (calling `ContactService.deleteContact` + `UniversalGovernanceService.purgePassenger` / `purgeAllBlacklistedPassengers` and refreshing state).
- [x] Update `PassengerDirectoryPanel.tsx` to render the `Blacklist (N)` tab, the `Purge All Blacklisted` bulk action with confirmation, and per-passenger `Restore` and `Purge` actions with confirmation.
- [x] Update `CustomerProfileDrawer.tsx` to expose a `Purge` action (with confirmation) when viewing a blacklisted passenger.

## Verification
- `npm run typecheck`
- `npm run build`
