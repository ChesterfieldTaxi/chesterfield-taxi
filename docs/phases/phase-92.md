# Phase 92: Dark Mode Foundation + Dispatch Console

## Goal
Introduce a semantic-token dark mode foundation and ship it for the dispatch console (including the pop-out window and Google Map). Leave a documented pathway for admin, client portal, corporate portal, and live site (future phases 93-96).

## Design Decisions
- Tailwind v4 `@custom-variant dark (&:where(.dark, .dark *))` so the existing `.dark` class toggle in `root.tsx` works (default v4 `dark:` uses the OS media query only).
- Semantic CSS-variable tokens (surface, border, text, status) defined in `app.css` for `:root` and `.dark`, exposed via `@theme` as utilities (e.g. `bg-surface-card`, `text-fg-muted`). Prefer tokens over per-class `dark:` variants.
- Theme preference values: `light` | `dark` | `system`. Default for users with no saved value: `light`.
- Storage: per-user preference saved on the user profile in Firestore, cached in `localStorage`. Apply localStorage first (no blocking on Firestore); on a new device, fall back to profile value, then `light`.
- Strict abstraction: a pure theme service and a `useTheme` hook; UI never touches Firestore directly. Appearance options are config-driven (options array).
- UI entry point: rename "Console & Map Settings" to **Dispatch Settings** in `DispatchDesktopTopHeader.tsx` and add an Appearance control (Light / Dark / System).
- Dispatch pop-out follows the theme live via `storage` events; `LiveFleetMap` applies a dark map style from the resolved theme.
- Pre-hydration script in `root.tsx` must read the same storage key and handle `system` to avoid a flash of light theme.
- Live-site brand themes stay authoritative. Only add an optional, unused `darkTokens` field to the brand theme type as a pathway (no behavior change this phase).
- Status colors (red/amber/green badges) need dark-tuned tones for contrast.
- Out of scope: admin, passenger (`app.tsx`), corporate, driver, public live-site visual conversion.

## Pathway (future phases, not built here)
- Phase 93: Admin (~1,150 hardcoded color classes) — codemod + visual pass.
- Phase 94: Client portal (`/app/passenger`).
- Phase 95: Corporate portal (`/app/corporate`).
- Phase 96: Live site — honor `darkTokens` per brand theme, optional visitor toggle.

## Files to Touch
- `app/app.css` — add `@custom-variant dark`, semantic tokens for `:root`/`.dark`, `@theme` utilities.
- `app/root.tsx` — update pre-hydration script (shared storage key, `system` handling).
- `app/config/theme-tokens.ts` (new) — appearance options, storage key, token names.
- `app/services/theme.service.ts` (new) — get/set/resolve/apply preference, localStorage cache, profile sync via existing user-profile service.
- `app/hooks/useTheme.ts` (new) — React hook; listens to `storage` events and `prefers-color-scheme`.
- User profile type + service (locate with targeted search) — add `themePreference?: 'light' | 'dark' | 'system'`.
- `app/components/domain/dispatch/workspace/DispatchDesktopTopHeader.tsx` — rename to Dispatch Settings, add Appearance control.
- `app/components/domain/dispatch/LiveFleetMap.tsx` — dark map styles.
- `app/routes/dispatch.tsx`, `app/routes/dispatch.popout.tsx` — initialize theme; pop-out syncs via `storage`.
- `app/components/ui/FloatingWindow.tsx` — token conversion.
- `app/components/domain/dispatch/**` — convert ~880 hardcoded color classes to tokens.
- `scripts/codemod-dark-tokens.mjs` (new) — codemod for common mappings (`bg-white`, `bg-slate-50`, `border-slate-200`, `text-slate-*`), scoped by path argument.
- `app/components/domain/admin/website/theme-presets.ts` — optional `darkTokens` field on theme type (unused).

## Tasks
- [x] Add `@custom-variant dark` and semantic tokens (`:root` and `.dark`) with `@theme` utilities in `app/app.css`
- [x] Create `theme-tokens.ts` config, `theme.service.ts`, and `useTheme.ts`
- [x] Add `themePreference` to user profile type/service; sync with localStorage cache
- [x] Update `root.tsx` pre-hydration script (shared key, `system`, no flash)
- [x] Rename "Console & Map Settings" to "Dispatch Settings" and add Appearance control in `DispatchDesktopTopHeader.tsx`
- [x] Write codemod script; run on `components/domain/dispatch/**` and `FloatingWindow.tsx`
- [x] Hand-fix leftovers; tune status colors for dark contrast
- [x] Apply dark map style in `LiveFleetMap.tsx` based on resolved theme
- [x] Wire theme init in `dispatch.tsx`; live sync in `dispatch.popout.tsx` via `storage` events
- [x] Add optional `darkTokens` field to brand theme type (no behavior change)
- [x] Verify no leftover `bg-white` / `bg-slate-*` in dispatch (grep check)
- [x] Add unit tests for `theme.service.ts` (resolve/apply/fallback order)

## Verification
- `npm run typecheck`
- `npx vitest run theme` (targeted tests for the theme service; adjust to the project's test runner)
- `Get-ChildItem app\components\domain\dispatch -Recurse -Include *.tsx | Select-String -Pattern "bg-white|bg-slate-"` (expect no or only justified matches)
- `npm run build`
- Manual: toggle Light/Dark/System in Dispatch Settings; confirm pop-out and map follow live; confirm no flash on reload; confirm admin/passenger/corporate/live site are visually unchanged.
