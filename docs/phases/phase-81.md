# Phase 81: Comms Status Persistence & Real-Time Sync Hardening

## Goal
Ensure read/unread, archive, and soft-delete status changes in CommsHub persist reliably across page refreshes, Twilio/server syncs, and EmailDock, while hardening real-time Firestore and cross-window synchronization.

## Design Decisions
- **Single Source of Truth (`CommsThreadService`):** Route `list_voicemails`, `list_messages`, and `list_recordings` updates through `CommsThreadService` rather than mutating a parallel `interactions` array, and retire `STORAGE_KEY_INTERACTIONS` so deleted/read state cannot diverge or fail to persist when the list is empty.
- **Soft-Delete Tombstones & Timestamped LWW:** Add `statusUpdatedAtMs` to `CommsEvent` and `CommsThread`. Reconcile `isUnread`, `isArchived`, and `isDeleted` using `statusUpdatedAtMs` last-write-wins (with `isDeleted: true` as a sticky tombstone) across `CommsThreadService`, `commsServerStore`, and Firestore so Twilio/webhook syncs never resurrect deleted or already-read items.
- **Authoritative Server Status Mutation Endpoint:** Add an `update_comms_status` POST action to `/api/telephony` that updates `commsServerStore` and flushes to Firestore; update `flushAndSyncCommsServer` to merge newer Firestore records into `commsServerStore` even when an ID already exists in memory.
- **Bidirectional Email Sync:** Propagate read/unread, archive/unarchive, and delete actions on email-channel `CommsEvent`s from `CommsThreadService` back to `DispatchEmailService` (with a re-entrancy guard) so `EmailDock` and `CommsHub` stay consistent.
- **Auth-Aware Real-Time Sync & Fallback Triggers:** Hook `CommsThreadService.startRealtimeSync()` to `getAdminAuthService().onAuthStateChanged` so `onSnapshot` tears down and re-attaches when staff auth initializes (and resets `realtimeStarted` on listener errors). Add `WorkspaceBus` status-change broadcasts and `visibilitychange` / `online` / `focus` re-sync triggers in `useCommsInteractionSync`.

## Files to Touch
- `app/core/types/comms.ts` — Add optional `statusUpdatedAtMs?: number` to `CommsEvent` and `CommsThread`.
- `app/core/services/comms/comms-thread.service.ts` — Add `statusUpdatedAtMs` updates on read/unread/archive/delete mutations, LWW + sticky `isDeleted` reconciliation in `hydrateFromServerSync` and `onSnapshot`, `update_comms_status` server sync call, auth-aware `startRealtimeSync()` retry/re-attach, `WorkspaceBus` status broadcast, and `DispatchEmailService` bidirectional status propagation.
- `app/core/services/comms/comms-thread.server.ts` — Add `updateCommsStatusServer(...)`, update `flushAndSyncCommsServer` to reconcile `remoteThreads` / `remoteEvents` by `statusUpdatedAtMs` / `updatedAtMs` even if already in `commsServerStore`, and preserve `isDeleted` / `isArchived` tombstones.
- `app/core/services/comms/telephony-credentials.server.ts` — Register `'update_comms_status'` in telephony action types/dispatcher allowlist if applicable.
- `app/core/services/comms/telephony-gateway.server.ts` — Handle `POST /api/telephony` `update_comms_status` action and guard `list_messages` / `list_voicemails` ingestion from overwriting existing `isDeleted` / read status.
- `app/core/services/email/dispatch-email.service.ts` — Add helper/re-entrancy guard to accept status updates (`isUnread`, `folder: 'archive' | 'trash' | 'inbox'`) from `CommsThreadService` without re-triggering mirror loops.
- `app/components/domain/dispatch/comms/useCommsInteractionSync.ts` — Route `list_voicemails`, `list_messages`, and `list_recordings` through `CommsThreadService`, derive `interactions` from `CommsThreadService` (retiring `STORAGE_KEY_INTERACTIONS`), and add throttled `visibilitychange` / `online` / `focus` re-sync listeners.
- `app/components/domain/dispatch/CommsHub.tsx` — Ensure bulk/row read, archive, and delete handlers operate cleanly through `CommsThreadService` (including non-grouped views).
- `scripts/test-comms-threads-telephony.ts` — Add assertions for read/delete persistence across `sync_comms` / `list_messages` / `list_voicemails`, `statusUpdatedAtMs` LWW, `update_comms_status`, and bidirectional email sync.

## Tasks
- [x] Add `statusUpdatedAtMs?: number` to `CommsEvent` and `CommsThread` in `app/core/types/comms.ts`.
- [x] Implement `updateCommsStatusServer` and LWW Firestore reconciliation in `app/core/services/comms/comms-thread.server.ts`, plus wire `update_comms_status` and `list_messages`/`list_voicemails` tombstone guards in `telephony-credentials.server.ts` and `telephony-gateway.server.ts`.
- [x] Update `CommsThreadService` (`app/core/services/comms/comms-thread.service.ts`) to stamp `statusUpdatedAtMs`, reconcile thread + event tombstones in `hydrateFromServerSync` and `onSnapshot`, call `update_comms_status` on mutations, re-attach `onSnapshot` via `onAuthStateChanged` (resetting on error), and broadcast status updates over `WorkspaceBus`.
- [x] Add re-entrancy-guarded bidirectional status sync between `CommsThreadService` and `DispatchEmailService` (`app/core/services/email/dispatch-email.service.ts`).
- [x] Refactor `useCommsInteractionSync.ts` and `CommsHub.tsx` to route all `fetchTelephonyData` results through `CommsThreadService`, retire `STORAGE_KEY_INTERACTIONS`, and add throttled `visibilitychange` / `online` / `focus` re-sync.
- [x] Add/update unit & integration tests in `scripts/test-comms-threads-telephony.ts` (keeping all test fixtures compliant with `constitution.md` hygiene rules) and run verification.

## Verification
- `npm run typecheck`
- `npx tsx scripts/test-comms-threads-telephony.ts`
- `npx tsx scripts/test-email-dock-service.ts`
