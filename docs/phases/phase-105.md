# Phase 105: Driver Ownership, Multi-Subpage Payouts & Flexible Commission Rules

## Goal
Add a Driver Car Ownership classification (`Owner-Operator` default, `Company-Owned`), split the unified Payouts view into three dedicated Admin subpages (`Driver Payouts`, `Staff Payroll`, `Other Payees`), and upgrade the driver payout engine to support both `Percent` (with universal/ownership/payment-type/individual percentage overrides and multi-select commissionable base components) and `Flat` (`day`, `week`, `month`) lease/fee modes.

## Design Decisions
- **Car Ownership Classification**: Stored on driver/operator records as `carOwnership?: 'owner_operator' | 'company_owned'` (defaults to `'owner_operator'`). Exposed as a dropdown in `OperatorCreateDrawer` and `OperatorEditorDrawer`, and displayed as a badge in `DriverPayoutsPanel`.
- **Dedicated Payout Subpages**: Replace the `payouts` subpage in `admin-nav.util.ts` under `invoicing` / `financials` with three dedicated subpages:
  - `driver-payouts` (`Driver Payouts`) — legacy `?sub=payouts` aliases here.
  - `staff-payouts` (`Staff Payroll`)
  - `other-payees` (`Other Payees`)
  Each subpage renders its own table and filters `PayoutSettlementHistoryTable` to its corresponding `payeeType`.
- **Driver Payout Types (`percent` vs `flat`)**:
  - Configurable per driver (`payoutType?: 'percent' | 'flat'`, `flatPayoutPeriod?: 'day' | 'week' | 'month'`, `flatPayoutAmount?: number`).
  - **Flat Mode**: Represents a flat fee/lease the driver must pay the company for the selected period regardless of income. Period multiplier uses calendar days in the selected `PayoutPeriodWindow` (`day`: `calendarDays`, `week`: `calendarDays / 7`, `month`: `calendarDays / 30`). `platformFee = flatPayoutAmount * periodMultiplier`; `driverFareShare = grossFares`; `netPayout = (grossFares + tips + tolls) - platformFee - alreadySettledAmount` (allows negative balance when the flat fee exceeds earnings).
- **Percent Mode Commissionable Base & Rate Precedence**:
  - **Commissionable Base Multi-Select** (`commissionableComponents` in `BillingSettingsConfig`): Admin can toggle `'base_fare' | 'extras' | 'wait_delay' | 'surcharges' | 'tolls' | 'tips'` (default `['base_fare', 'extras', 'wait_delay']` — excludes tips, tolls, and surcharges). Excluded `tips` and `tolls` pass through 100% to the driver; other excluded components are retained by the company.
  - **Rate Precedence (per trip)**:
    1. Per-driver payment-type override (if `usePaymentTypeCommissionSplit` is enabled) → Per-driver `commissionRate`
    2. Global payment-type % (`paymentTypeCommissionPercents[cash | card | account]`, where `corporate` maps to `account`, if enabled)
    3. Car Ownership % (`ownerOperatorCommissionPercent` or `companyOwnedCommissionPercent`)
    4. Universal % (`driverDefaultCommissionPercent`, default `75`)
- **Strict Service/UI Abstraction (`constitution.md`)**: All payout math, component extraction, period multipliers, and rate precedence live in `app/core/services/payouts.service.ts`; UI components remain purely presentational consumers.

## Files to Touch
- `app/core/types/driver.ts` — Add `DriverCarOwnership`, `DriverPayoutType`, `FlatPayoutPeriod`, and `PaymentTypeCommissionRates` fields to `DriverProfile`.
- `app/core/types/config.ts` — Extend `BillingSettingsConfig` / `NormalizedBillingSettingsConfig` / `DEFAULT_BILLING_SETTINGS_CONFIG` / `normalizeBillingSettingsConfig` with `ownerOperatorCommissionPercent`, `companyOwnedCommissionPercent`, `commissionableComponents`, `usePaymentTypeCommissionSplit`, and `paymentTypeCommissionPercents`.
- `app/core/services/operator.service.ts` — Add `carOwnership`, `payoutType`, `flatPayoutPeriod`, `flatPayoutAmount`, `commissionRate`, and `paymentTypeCommissionRates` to `OperatorUser` / `DriverRosterItem` and persistence mapping.
- `app/core/services/payouts.service.ts` — Upgrade `computeDriverEarningsRollup` (and helper `extractTripFareComponents`) to support `carOwnership`, `payoutType` (`percent` vs `flat` with calendar-day period multiplier), `commissionableComponents` multi-select, and `paymentTypeCommissionPercents` (`cash` / `card` / `account`).
- `app/core/utils/admin-nav.util.ts` — Split `payouts` into `driver-payouts`, `staff-payouts`, `other-payees` under `invoicing` and `financials`, and alias legacy `payouts` to `driver-payouts`.
- `app/components/domain/admin/operators/operator-provisioning.util.ts` — Add `carOwnership` (default `'owner_operator'`) to create/edit form state & initializers.
- `app/components/domain/admin/operators/OperatorCreateDrawer.tsx` — Add `Car Ownership` dropdown (`Owner-Operator`, `Company-Owned`) when `driver` role is selected.
- `app/components/domain/admin/operators/OperatorEditorDrawer.tsx` — Add `Car Ownership` dropdown (`Owner-Operator`, `Company-Owned`) in Driver & Vehicle Assignment section.
- `app/components/domain/admin/invoicing/useAdminPayoutsController.ts` — Support `driver-payouts` / `staff-payouts` / `other-payees` active subpages, pass `billingDraft` commission rules and per-driver payout/commission overrides into `computeDriverEarningsRollup`, and support persisting per-driver payout settings.
- `app/components/domain/admin/invoicing/DriverPayoutsPanel.tsx` — Remove 3-pill switcher; add policy controls for `Universal %`, `Owner-Operator %`, `Company-Owned %`, `Commissionable Base` multi-select pills, and `Payment-Type Split` (`Cash %`, `Card %`, `Account %`); update driver table rows with ownership badge, `Percent`/`Flat` selector, inline `Share %` (or payment-type % inputs) / `$ Amount + day/week/month` inputs, and negative/owed balance display.
- `app/components/domain/admin/invoicing/StaffAndOtherPayeesTables.tsx` — Render dedicated `Staff Payroll` or `Other Payees` view cleanly without the old pill switcher.
- `app/components/domain/admin/invoicing/PayoutSettlementHistoryTable.tsx` — Support optional `payeeTypeFilter` (`'driver' | 'staff' | 'other'`) so each subpage shows its own settlement history.
- `app/components/domain/admin/subpages/AdminInvoicingSubpage.tsx` — Wire `driver-payouts`, `staff-payouts`, and `other-payees` subpages to their respective panels.

## Tasks
- [x] Update `app/core/types/driver.ts`, `app/core/types/config.ts`, and `app/core/services/operator.service.ts` with car ownership (`owner_operator` default), payout type (`percent` / `flat` + `day` / `week` / `month`), ownership percentages, commissionable base components, and payment-type percentage configs.
- [x] Update `app/core/services/payouts.service.ts` to extract itemized trip fare components (`baseFare`, `extras`, `waitDelay`, `surcharges`, `tolls`, `tips`), apply `commissionableComponents` filtering, resolve rate precedence (individual → payment type → car ownership → universal), and compute `flat` period fees using calendar days.
- [x] Update `app/core/utils/admin-nav.util.ts` to split `payouts` into `driver-payouts`, `staff-payouts`, and `other-payees` (with legacy `payouts` alias → `driver-payouts`).
- [x] Add `Car Ownership` dropdown (`Owner-Operator`, `Company-Owned`) to `operator-provisioning.util.ts`, `OperatorCreateDrawer.tsx`, and `OperatorEditorDrawer.tsx`.
- [x] Update `useAdminPayoutsController.ts`, `AdminInvoicingSubpage.tsx`, `DriverPayoutsPanel.tsx`, `StaffAndOtherPayeesTables.tsx`, and `PayoutSettlementHistoryTable.tsx` to render the 3 dedicated subpages, Universal/Ownership/Payment-Type/Commissionable-Base policy controls, and per-driver `Percent` vs `Flat (day/week/month)` inline controls.
- [x] Run `npm run typecheck` and `npm run build` to verify zero TypeScript or build errors.

## Verification
- `npm run typecheck`
- `npm run build`
