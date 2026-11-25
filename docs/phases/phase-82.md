# Phase 82: CommsHub Tab Icons & Voicemail Label

## Goal
Update the 4-segment tab switcher in `CommsHub` (`All`, `Calls`, `Messages`, `Voicemail`) to display an icon on every tab and rename the `VM` tab label to `Voicemail`. Use the existing `@container/commshub` container query so tabs remain compact (icon + badge with `title` tooltip) in narrow dock widths and show full labels at wider widths.

## Design Decisions
- **Icons:** Add a classic cassette/tape `VoicemailIcon` to `app/components/ui/Icons.tsx` following the existing `IconProps` pattern, and use `LayersIcon` (`All`), `PhoneIcon` (`Calls`), `ChatBubbleLeftRightIcon` (`Messages`), and `VoicemailIcon` (`Voicemail`).
- **Config-Driven Tabs:** Keep the 4-segment switcher in `app/components/domain/dispatch/CommsHub.tsx` driven by a single tab config array (`id`, `label`, `icon`, `badge`, `cls`).
- **Responsive Dock Behavior:** Show `icon` + `label` (`All`, `Calls`, `Messages`, `Voicemail`) at wider `@container/commshub` widths (e.g., `hidden @[340px]/commshub:inline` on the label `<span>`), and fall back to icon + unread badge with `title={t.label}` and `aria-label={t.label}` at narrow dock widths.
- **Scope:** Leave `shortLabel: 'VM'` in `app/core/services/comms/comms-templates.service.ts` unchanged (compact event pills only).

## Files to Touch
- `app/components/ui/Icons.tsx` — Add and export `VoicemailIcon` (classic cassette/tape SVG matching `IconProps`).
- `app/components/domain/dispatch/CommsHub.tsx` — Import `LayersIcon`, `PhoneIcon`, `ChatBubbleLeftRightIcon`, and `VoicemailIcon`; update the 4-tab config array to include `icon` and rename `'VM'` to `'Voicemail'`; render responsive icon + label + badge with `title` and `aria-label`.

## Tasks
- [x] Add `VoicemailIcon` to `app/components/ui/Icons.tsx` matching the existing `IconProps` signature and stroke styling.
- [x] Update the 4-segment tab switcher in `app/components/domain/dispatch/CommsHub.tsx` to include `LayersIcon`, `PhoneIcon`, `ChatBubbleLeftRightIcon`, and `VoicemailIcon`, rename `'VM'` to `'Voicemail'`, add `title`/`aria-label`, and hide text labels below `@[340px]/commshub` so narrow dock widths stay icon + badge without clipping.
- [x] Run `npm run typecheck` to verify there are no TypeScript or import errors.

## Verification
- `npm run typecheck`
