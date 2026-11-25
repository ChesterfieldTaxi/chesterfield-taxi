# Phase 79: Phone Dock Multi-Select, Hover Checkboxes, Quick Read/Unread & Mobile Long-Press

## Goal
Add multi-select checkboxes across every communication channel in the Phone Dock (`CommsHub`), overlaying the contact avatar or channel icon on hover to save space, along with a per-row mark read/unread icon button to the left of the Call button. On mobile, support Gmail-style press-and-hold on any row to enter selection mode, revealing checkboxes for all rows and a contextual bulk action bar (select/deselect all, mark read/unread, archive, soft-delete).

## Design Decisions
- **Soft-Delete (`isDeleted`):** Deleting threads or events sets `isDeleted: true` in `CommsThreadService` (`localStorage` + Firestore) and filters them out of active lists, preventing accidental permanent data loss or webhook re-creation.
- **Archive & "Show Archived" Filter:** Archived threads/events (`isArchived: true`) are hidden from the active list by default, with a **"Show Archived"** toggle added to `CommsFilterToolbar` so dispatchers can view or restore archived items.
- **Contextual Bulk Action Bar:** Whenever `selectedRowKeys.size > 0` (desktop or mobile), a contextual action bar replaces/overlays Row 2 (`CommsFilterToolbar`) with Select/Deselect All, selected count, Mark Read/Unread, Archive, Delete, and Clear (`×` / `Escape`).
- **Scope by View:** Grouped/Messages views key selection and bulk/row actions by `threadId` (`*Threads` service methods); Stream/Calls/VM views key by `event.id` (`*Events` service methods).
- **Space-Saving Hover & Mobile Long-Press:** Desktop reveals the checkbox over the leading avatar/channel icon on row hover (or whenever selection mode is active). Mobile uses a ~450ms press-and-hold gesture (cancelled on scroll/pointer-move > 8px) to select the row and enter selection mode, after which tapping any row toggles its checkbox.
- **Strict Abstraction:** All read/unread, archive, unarchive, and soft-delete mutations live in `CommsThreadService`; UI components only invoke service methods and callbacks.

## Files to Touch
- `app/core/types/comms.ts` — Add `isDeleted?: boolean` to `CommsThread` and `CommsEvent`.
- `app/core/services/comms/comms-thread.service.ts` — Add `deleteThreads(threadIds)`, `deleteEvents(eventIds)`, and `unarchiveThreads`/`unarchiveEvents` methods; exclude `isDeleted` items from active getters/rollups and support `includeArchived` filtering.
- `app/components/domain/dispatch/comms/useCommsInteractionSync.ts` — Add `showArchived` filter state and exclude `isDeleted` items (and `isArchived` items unless `showArchived` is true) from derived lists and unread counts.
- `app/components/domain/dispatch/CommsHub.tsx` — Manage `selectedRowKeys` (auto-clear on tab/view/thread change or `Escape`), `showArchived`, and bulk/per-row handlers (`handleToggleSelectRow`, `handleToggleSelectAll`, `handleBulkMarkReadUnread`, `handleBulkArchive`, `handleBulkDelete`, `handleToggleRowReadStatus`).
- `app/components/domain/dispatch/comms/CommsFilterToolbar.tsx` — Render the contextual selection action bar when `selectedCount > 0` (Select/Deselect All, Mark Read/Unread, Archive, Delete, Clear) and add the "Show Archived" toggle to the Filter menu.
- `app/components/domain/dispatch/comms/SmsThreadPane.tsx` — In `mode === 'list'`, add hover/selection-mode checkbox overlaying the avatar initial, add the mark read/unread icon button immediately left of the `Call` button, and wire mobile press-and-hold selection.
- `app/components/domain/dispatch/comms/VoicemailCallLogPane.tsx` — Across Voicemail, Call History (`call_*`), and Stream (`sms`, `email`, `note`) rows, add hover/selection-mode checkbox overlaying the channel icon, add the mark read/unread icon button immediately left of the `Call` button (or `Email ↗`), and wire mobile press-and-hold selection.

## Tasks
- [x] Update `CommsThread` and `CommsEvent` in `app/core/types/comms.ts` with `isDeleted?: boolean`.
- [x] Implement `deleteThreads`, `deleteEvents`, `unarchiveThreads`, and `unarchiveEvents` in `app/core/services/comms/comms-thread.service.ts`, filtering out `isDeleted` items from active thread/event queries and rollups.
- [x] Update `app/components/domain/dispatch/comms/useCommsInteractionSync.ts` to exclude `isDeleted` items and respect `showArchived` state across all channel lists and unread counts.
- [x] Add `selectedRowKeys` state, `showArchived` state, and bulk/single-row read-unread/archive/delete handlers in `app/components/domain/dispatch/CommsHub.tsx`.
- [x] Update `app/components/domain/dispatch/comms/CommsFilterToolbar.tsx` to render the contextual bulk action bar when `selectedCount > 0` and include the "Show Archived" toggle in the Filter dropdown.
- [x] Add a reusable long-press hook/helper (cancelling on scroll/move > 8px) and integrate hover/selection checkboxes + quick mark read/unread icon button (left of Call) into `app/components/domain/dispatch/comms/SmsThreadPane.tsx` (`mode === 'list'`).
- [x] Integrate hover/selection checkboxes (over channel icon), quick mark read/unread icon button (left of Call / Email), and mobile press-and-hold selection into `app/components/domain/dispatch/comms/VoicemailCallLogPane.tsx` for Voicemail, Calls, and Stream rows.
- [x] Run typecheck and build verification.

## Verification
- `npm run typecheck`
- `npm run build`
