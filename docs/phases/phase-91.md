# Phase 91: Driver App Messages Tab & Merged Profile Tab

## Goal
Add a **Messages** tab to the Driver App so drivers can receive real-time broadcast and direct alerts from dispatch with unread tracking and explicit acknowledgement, while merging the existing **Earnings** and **Hours** tabs into a unified **Profile** tab (`Earnings | Hours | Account`) to keep the 5-tab bottom navigation bar clean.

## Design Decisions
- **Reuse `dispatch_alerts`:** Extend `DispatchAlertRecord` in `app/core/services/dispatch/dispatch-alerts.service.ts` with optional `targetDriverId?: string | null` and `readBy?: Record<string, number>` so both fleet-wide broadcasts and driver-targeted alerts work without altering dispatcher-side `isRead` state.
- **Driver-Scoped Filtering & Security:** Exclude dismissed alerts and internal dispatch-only system alerts (`to === 'Dispatch Operations'`) from the driver feed; update `firestore.rules` so signed-in drivers can read matching `dispatch_alerts` (`targetDriverId == null` or `== request.auth.uid`) and update only their own `readBy` receipt.
- **Merged `Profile` Tab:** Replace the separate `Earnings` and `Hours` bottom tabs with a single `Profile` tab containing a segmented sub-tab bar (`Earnings | Hours | Account`), reusing `DriverEarningsHistoryPane` for `Earnings` and `Hours` and surfacing driver identity, assigned vehicle, preferred navigation app, and sign-out in `Account`.
- **Config-Driven Tabs:** Define bottom nav tabs (`active`, `offers`, `scheduled`, `messages`, `profile`) and `Profile` sub-tabs (`earnings`, `hours`, `account`) via configuration arrays in `app/core/utils/driver-ui.util.ts`.

## Files to Touch
- `app/core/utils/driver-ui.util.ts` — Update `DriverTab` to `'active' | 'offers' | 'scheduled' | 'messages' | 'profile'` and add config arrays for bottom tabs and profile sub-tabs.
- `app/core/services/dispatch/dispatch-alerts.service.ts` — Add `targetDriverId` and `readBy` to `DispatchAlertRecord` / `SendDispatchAlertInput`, plus `subscribeForDriver(driverUid, cb)` and `markDriverAlertRead(alertId, driverUid)` with offline/BroadcastChannel parity.
- `app/core/hooks/dispatch/useDispatchFleetAlerts.ts` — Pass optional `targetDriverId` when `sendAlert` targets a specific driver.
- `firestore.rules` — Allow authenticated drivers to read driver-targeted/broadcast `dispatch_alerts` and update only `readBy` / `updatedAt`.
- `app/components/domain/driver/DriverMessagesPane.tsx` — New component displaying dispatch alerts (urgent/unread highlighted, broadcast vs. direct badge, `Mark Read` / `Acknowledge` button, empty state).
- `app/components/domain/driver/DriverProfilePane.tsx` — New component with segmented `Earnings | Hours | Account` sub-tabs wrapping `DriverEarningsHistoryPane` and driver account/nav preferences.
- `app/routes/driver.tsx` — Subscribe to driver alerts via `dispatchAlertsService.subscribeForDriver`, compute unread badge count, render `DriverMessagesPane` and `DriverProfilePane`, and update the 5-tab bottom navigation bar.
- `scripts/test-driver-messages-and-profile-phase91.ts` — Targeted unit/render verification for `DispatchAlertsService` driver filtering/read receipts, `DriverMessagesPane`, and `DriverProfilePane`.

## Tasks
- [x] Update `DriverTab` and add config-driven tab definitions in `app/core/utils/driver-ui.util.ts`.
- [x] Extend `DispatchAlertRecord`, `SendDispatchAlertInput`, `normalizeAlertRecord`, `subscribeForDriver`, and `markDriverAlertRead` in `app/core/services/dispatch/dispatch-alerts.service.ts`, and wire `targetDriverId` in `app/core/hooks/dispatch/useDispatchFleetAlerts.ts`.
- [x] Update `firestore.rules` for `dispatch_alerts` so drivers can read broadcast/self-targeted alerts and update only `readBy` / `updatedAt`.
- [x] Create `app/components/domain/driver/DriverMessagesPane.tsx` for viewing and acknowledging dispatch alerts.
- [x] Create `app/components/domain/driver/DriverProfilePane.tsx` merging `Earnings`, `Hours`, and `Account` sub-tabs.
- [x] Wire `Messages` and `Profile` tabs, unread badge, and alert subscription into `app/routes/driver.tsx`.
- [x] Add `scripts/test-driver-messages-and-profile-phase91.ts` and verify all checks pass.

## Verification
- `npm run typecheck`
- `npx tsx scripts/test-driver-messages-and-profile-phase91.ts`
