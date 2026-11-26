# Phase 90: Comms Hub Pastel Avatars, Unified 2-Row Entries, Inline Voicemail Expand & 5s Thread Entry Glow

## Goal
Unify contact avatars and row heights across all four Comms Hub tabs (`All`, `Calls`, `Messages`, and `Voicemail`) so every entry uses a deterministic multi-color pastel profile circle (with first + last initials or `UserIcon` fallback) and a consistent 2-row compact layout (`min-h-[52px]`). Add an inline `▾` transcription expand toggle on voicemail entries (both in list tabs and inside threads) so dispatchers can read full transcripts without opening the thread, and scroll to + highlight any clicked entry with a 5-second glow upon entering its thread.

## Design Decisions
- **Config-Driven Pastel Avatar & Initials (`COMMS_AVATAR_PASTEL_PALETTE` + `resolveContactAvatarSpec`):**
  - Store an 8-tone accessible Tailwind v4 pastel palette (`bg-sky-100 text-sky-800`, `bg-rose-100 text-rose-800`, `bg-emerald-100 text-emerald-800`, `bg-violet-100 text-violet-800`, `bg-amber-100 text-amber-800`, `bg-teal-100 text-teal-800`, `bg-indigo-100 text-indigo-800`, `bg-fuchsia-100 text-fuchsia-800`) and deterministic resolver in `comms-timeline.util.ts` (zero DOM/React coupling).
  - Hash deterministically by normalized 10-digit phone -> normalized email -> normalized name -> fallback ID so a contact always receives the exact same pastel tone across `All`, `Calls`, `Messages`, and `Voicemail`.
  - Extract uppercase first + last initials for real names (`"Jane Doe"` -> `"JD"`, `"Jane"` -> `"J"`). For unsaved phone numbers (`+1...`, `(314)...`), email-as-name, or `"Unknown Caller"`, return `initials: null` so `CommsContactAvatar` renders `UserIcon` inside the pastel circle.
- **Shared `CommsContactAvatar` Component:**
  - Render a `w-8 h-8 rounded-full` pastel circle across `SmsThreadPane` (list mode) and `VoicemailCallLogPane` (`Calls`, `Voicemail`, and `All` stream mode), including the hover/selection `rounded-full` checkbox overlay (`data-row-checkbox`) for bulk actions.
- **Unified 2-Row Entry Layout (`min-h-[52px] px-3 py-1.5`) & Inline Row-2 Channel Icons:**
  - **All (Grouped) & Messages (`SmsThreadPane` list mode):** Keep the 2-row layout, upgrade the grey single-char circle to `CommsContactAvatar`, and prefix Row 2 with an inline colored channel/direction icon (`PhoneOffIcon`, `PhoneIcon`, `MicIcon`, `MailIcon`, `ChatBubbleLeftRightIcon`) ahead of the snippet.
  - **Calls & All Stream (`VoicemailCallLogPane`):** Replace the 1-row `min-h-[42px]` bare-icon call row and `w-6 h-6` stream icon row with the unified `min-h-[52px] px-3 py-1.5` 2-row layout: `CommsContactAvatar` on the left; Row 1 contact name + badges on left and timestamp on right; Row 2 inline colored direction/channel icon + status/duration (`Missed Call`, `Inbound Call · 1:42`, `Outbound Call · 0:45`) or snippet; compact right-side controls (`data-call-audio-player` Play/Speed when playable, Read/Unread toggle, Call / Email action). Preserve existing `data-call-log-row` and `data-call-audio-player` attributes.
- **Voicemail 2-Row Default + Inline `▾` Transcription Expand (List & Thread):**
  - Collapse Voicemail list entries (`Voicemail` tab, `All` Stream, and `All` Grouped rows whose `latestEvent.type === 'voicemail'`) into the unified `min-h-[52px] px-3 py-1.5` 2-row header by default: `CommsContactAvatar` on left; Row 1 contact name + timestamp; Row 2 amber `MicIcon` + duration + 1-line truncated transcription preview + compact `▾` (`ChevronDownIcon`, rotates `rotate-180` when expanded, `e.stopPropagation()`); right-side compact Play/Speed, Read/Unread, Call, and Book buttons.
  - Clicking `▾` (when `transcription` is non-empty) toggles full un-clamped transcription inline below Row 2 without navigating into the thread.
  - Inside the open thread (`SmsThreadPane` `mode="thread"`), add the same `▾` toggle (`data-voicemail-expand-toggle`) on voicemail cards to expand/collapse `line-clamp-2` vs. full transcription.
- **Scroll-to-Entry & 5-Second Glow on Thread Open:**
  - Extend `onSelectContact(selectorTarget: string, focusEventId?: string)` across `useCommsMessagingAndContacts.ts`, `CommsHub.tsx`, `VoicemailCallLogPane.tsx` (passing `event.id`), and `SmsThreadPane.tsx` list mode (passing `row.latestEvent.id`).
  - Maintain a `{ eventId: string; nonce: number } | null` highlight state in `useCommsMessagingAndContacts.ts` that auto-clears after `5000ms` (cleaning up any prior timeout so re-clicking the same entry restarts the full 5s glow).
  - Add `data-timeline-event-id={evt.id}` (and `data-timeline-highlighted="true"` while active) to every rendered event item in `SmsThreadPane` (`mode="thread"`). When a `focusEventId` is active upon opening the thread, scroll `[data-timeline-event-id="<id>"]` into view (`scrollIntoView({ behavior: 'smooth', block: 'center' })`) instead of scrolling to `messagesEndRef` at the bottom, and apply a prominent 5-second glow (`ring-2 ring-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.45)] transition-all duration-500`). Normal bottom auto-scroll to `messagesEndRef` remains intact when sending new messages or opening a thread without a `focusEventId`.

## Files to Touch
- `app/components/domain/dispatch/comms/comms-timeline.util.ts` — Add `COMMS_AVATAR_PASTEL_PALETTE` config and pure `resolveContactAvatarSpec` helper (deterministic pastel tone + first/last initials vs. `null` fallback for unsaved numbers/unknown callers).
- `app/components/domain/dispatch/comms/CommsContactAvatar.tsx` — New shared `w-8 h-8 rounded-full` pastel initials / `UserIcon` avatar component with optional bulk-selection checkbox overlay (`data-row-checkbox`).
- `app/components/domain/dispatch/comms/VoicemailCallLogPane.tsx` — Adopt `CommsContactAvatar` and unified `min-h-[52px]` 2-row layout for Calls, Voicemail (with inline `▾` transcription expand state), and Stream rows; pass `(target, event.id)` to `onSelectContact`.
- `app/components/domain/dispatch/comms/SmsThreadPane.tsx` — Adopt `CommsContactAvatar`, Row 2 inline channel icons, and voicemail `▾` expand in list mode (passing `(row.selectorTarget, row.latestEvent.id)` on click); add `data-timeline-event-id`, scroll-to-focused-event, 5-second glow highlight, and voicemail `▾` expand toggle in thread mode.
- `app/components/domain/dispatch/comms/useCommsMessagingAndContacts.ts` — Support `selectContactWithFocus(target, focusEventId?)`, manage the 5-second `{ eventId, nonce }` highlight timer, and skip initial bottom `messagesEndRef` scroll when focusing a specific clicked event.
- `app/components/domain/dispatch/CommsHub.tsx` — Thread `highlightedEvent` state and `onSelectContact` signature through to `SmsThreadPane` and `VoicemailCallLogPane`.
- `scripts/test-comms-phase90-unified-rows-and-glow.ts` — New targeted verification test covering pastel avatar determinism, first+last initials & `UserIcon` fallback, unified 2-row rendering, inline voicemail `▾` expand, and 5-second thread scroll/glow contract.

## Tasks
- [x] Add `COMMS_AVATAR_PASTEL_PALETTE` and `resolveContactAvatarSpec` to `app/components/domain/dispatch/comms/comms-timeline.util.ts` handling 2+ word names (`First + Last` initials), single-word names, and unsaved/phone/email/`Unknown Caller` fallbacks (`initials: null`) with deterministic hashing.
- [x] Create `app/components/domain/dispatch/comms/CommsContactAvatar.tsx` rendering the `w-8 h-8 rounded-full` pastel avatar (`initials` text or `UserIcon`) and optional `data-row-checkbox` selection overlay.
- [x] Refactor `app/components/domain/dispatch/comms/VoicemailCallLogPane.tsx` so `call_*`, `voicemail`, and omnichannel stream rows all share the unified `min-h-[52px] px-3 py-1.5` 2-row structure with `CommsContactAvatar`, inline Row-2 channel/direction icons, compact voicemail `▾` inline transcription toggle (`e.stopPropagation()`), and `onSelectContact(target, event.id)`.
- [x] Update `app/components/domain/dispatch/comms/useCommsMessagingAndContacts.ts` and `app/components/domain/dispatch/CommsHub.tsx` to accept `(target, focusEventId?)` when selecting a contact, manage `highlightedTimelineEvent` (`{ eventId, nonce }`) with a 5,000ms auto-clear timeout, and avoid overriding event scroll with `messagesEndRef` on initial thread open when `focusEventId` is set.
- [x] Update `app/components/domain/dispatch/comms/SmsThreadPane.tsx` in `list` mode (pastel `CommsContactAvatar`, Row-2 channel icon, inline `▾` expand when `row.latestEvent` is a transcribed voicemail, and `onSelectContact(row.selectorTarget, row.latestEvent.id)`) and `thread` mode (`data-timeline-event-id={evt.id}`, smooth scroll-to-entry, 5-second glow classes, and voicemail `▾` expand toggle).
- [x] Create `scripts/test-comms-phase90-unified-rows-and-glow.ts` and run typecheck + targeted Comms regression suites to verify zero regressions.

## Verification
- `npm run typecheck`
- `npx tsx scripts/test-comms-phase90-unified-rows-and-glow.ts`
- `npx tsx scripts/test-comms-dock-v2-rebuild-phase73.ts`
- `npx tsx scripts/test-comms-profile-polish-phase73b.ts`
