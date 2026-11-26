# Phase 89: Real-Time Firestore Sync for Dispatch Alerts & App Suite (Zero Mock Data)

## Goal
Remove all hardcoded mock data from Dispatch Fleet Alerts and the Dispatch App Suite (Notes, Docs, Calendar, Tasks, and Presence), and synchronize them in real time with dedicated Firestore collections. Fix the bug where marking alerts as read or dismissing them causes them to reappear on page refresh, and auto-hide read alerts from the default view.

## Design Decisions
- **Dedicated Firestore Collections:** Store each entity in its own collection (`dispatch_alerts`, `dispatch_notes`, `dispatch_documents`, `dispatch_calendar`, `dispatch_tasks`, `dispatch_presence`) with per-document writes (`setDoc` / `updateDoc` / `deleteDoc`) and `onSnapshot` listeners so concurrent dispatcher edits never overwrite each other.
- **Security Rules (`isDispatcher()` only):** Restrict read/write access on all six collections in `firestore.rules` to authenticated dispatchers and admins (`isDispatcher()`).
- **Zero Mock Seeding & Clean Empty States:** Remove `createDefaultFleetMessages()`, `INITIAL_NOTES`, `INITIAL_DOCUMENTS`, `INITIAL_CALENDAR`, `INITIAL_TASKS`, and the simulated `Sarah J.` presence fallback. Render clean empty states when collections have no records.
- **Persistent Alert Read/Dismiss State & Auto-Hide:** Persist `isRead`, `isPinned`, and `dismissedAt` in `dispatch_alerts`. Auto-hide read alerts from the default view (e.g., `unread` / active view) while keeping an `all` ("All / History") filter to review read alerts.
- **System Alert Deduplication:** Add a stable `dedupeKey` to `pushSystemAlert` items and check existing Firestore alert docs (including already-read/dismissed ones within TTL) so refreshing the page never re-creates a previously read or dismissed system alert.
- **Tactical Presets & TTL Sync:** Sync `tacticalPresets` alongside `autoDismissMinutes` under `FleetAlertsConfig` in `app/core/types/config.ts` via `admin-config.service.ts`, using `localStorage` only as a non-authoritative cache.

## Files to Touch
- `firestore.rules` — Add `isDispatcher()` read/write rules for `dispatch_alerts`, `dispatch_notes`, `dispatch_documents`, `dispatch_calendar`, `dispatch_tasks`, and `dispatch_presence`.
- `app/core/types/config.ts` — Add optional `tacticalPresets?: string[]` to `FleetAlertsConfig`.
- `app/core/services/dispatch/dispatch-alerts.service.ts` — **New** Firestore-backed service for `dispatch_alerts` (`onSnapshot` sync, `sendAlert`, `toggleRead`, `togglePin`, `dismissAlert`, `markAllRead`, `clearUnpinned`, `pushSystemAlert` with `dedupeKey` deduplication).
- `app/core/hooks/dispatch/useDispatchFleetAlerts.ts` — Replace `localStorage`-only state and `createDefaultFleetMessages()` with `dispatchAlertsService` subscription, sync `tacticalPresets` via `admin-config.service.ts`, and default to hiding read alerts (with `all` / History filter).
- `app/components/domain/dispatch/workspace/DispatchRightOperationsDock.tsx` — Update alert filter labels/empty states to reflect auto-hidden read alerts vs. "All / History" view.
- `app/core/services/dispatch/dispatch-app-suite.service.ts` — Replace single-doc `dispatch_app_suite/shared_workspace` and all `INITIAL_*` mock arrays + fake `Sarah J.` presence with per-collection Firestore `onSnapshot` listeners and per-item CRUD on `dispatch_notes`, `dispatch_documents`, `dispatch_calendar`, `dispatch_tasks`, and `dispatch_presence`.
- `app/components/domain/dispatch/AppSuiteLauncher.tsx` — Handle empty arrays cleanly for Notes, Docs, Calendar, and Tasks with clear empty-state prompts/actions instead of assuming seeded defaults.

## Tasks
- [x] Add `dispatch_alerts`, `dispatch_notes`, `dispatch_documents`, `dispatch_calendar`, `dispatch_tasks`, and `dispatch_presence` rules (`allow read, write: if isDispatcher();`) to `firestore.rules`.
- [x] Extend `FleetAlertsConfig` in `app/core/types/config.ts` with `tacticalPresets?: string[]`.
- [x] Create `app/core/services/dispatch/dispatch-alerts.service.ts` with real-time `onSnapshot` sync to `dispatch_alerts`, CRUD/triage methods (`sendAlert`, `toggleRead`, `togglePin`, `dismissAlert`, `markAllRead`, `clearUnpinned`), and `dedupeKey`-based `pushSystemAlert` deduplication.
- [x] Refactor `app/core/hooks/dispatch/useDispatchFleetAlerts.ts` to remove `createDefaultFleetMessages()` and `localStorage` source-of-truth, subscribe to `dispatchAlertsService`, sync `tacticalPresets` via `admin-config.service.ts`, and auto-hide read alerts in the default view.
- [x] Update `app/components/domain/dispatch/workspace/DispatchRightOperationsDock.tsx` filter tabs/empty state so read alerts are hidden by default and accessible under the All/History filter.
- [x] Refactor `app/core/services/dispatch/dispatch-app-suite.service.ts` to remove `INITIAL_NOTES`, `INITIAL_DOCUMENTS`, `INITIAL_CALENDAR`, `INITIAL_TASKS`, `DEFAULT_AUTHOR` mock fallback, and simulated `Sarah J.` presence, replacing them with per-collection Firestore `onSnapshot` listeners and per-document CRUD (`dispatch_notes`, `dispatch_documents`, `dispatch_calendar`, `dispatch_tasks`, `dispatch_presence`).
- [x] Update `app/components/domain/dispatch/AppSuiteLauncher.tsx` to render clean empty states when `notes`, `documents`, `calendar`, or `tasks` are empty (no assumed `note-shift-handover` default).
- [x] Run `npm run typecheck` and `npm run build` and verify zero TypeScript or build errors.

## Verification
- `npm run typecheck`
- `npm run build`
