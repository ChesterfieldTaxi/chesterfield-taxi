# Phase 95: Dark Mode for Corporate Portal

## Goal
Extend the Phase 92–94 semantic-token dark mode to the corporate portal (`/app/corporate`) with a compact header Appearance toggle (`Light` / `Dark` / `System`), while keeping the driver portal and public live site visually unchanged.

## Design Decisions
- Reuse the Phase 92–94 foundation: semantic tokens in `app/app.css`, `theme.service.ts`, `useTheme`, `AppearanceToggle` (`variant="cycle"`), `theme-tokens.ts`, and `scripts/codemod-dark-tokens.mjs`. No new theme architecture.
- Extend `DARK_MODE_ENABLED_PATH_PREFIXES` in `app/config/theme-tokens.ts` with `'/app/corporate'` only (do not add `'/corporate'` since it redirects to `/app/corporate`).
- `app/routes/corporate.tsx`: wire `useTheme` with the signed-in user's `uid` and `themePreference` from `getAdminAuthService()`, syncing `localStorage` (`ct_theme_preference`) and the Firestore user profile.
- UI entry point: add `<AppearanceToggle variant="cycle" preference={themePreference} onChange={setThemePreference} />` in the top executive header of `app/routes/corporate.tsx` next to `RoleViewSwitcher` and `UserDropdown`, styled cleanly against the dark `bg-slate-950` header.
- Convert hardcoded color classes in `app/routes/corporate.tsx` to semantic tokens, tune status badges (`formatRideStatusBadge` and invoice badges) and modals/empty states for dark contrast, and preserve `print:` statement styling.
- Shared components (`UserDropdown.tsx`, `BookingEngineV2.tsx`, `DispatchLocationInput.tsx`, `RoleViewSwitcher`, `Card`, `Select`, `Button`, `Badge`) are already token-converted from Phases 92–94.
- Out of scope: `/driver` and public live-site routes (`/`, `/book`, etc. — Phase 96).

## Files to Touch
- `app/config/theme-tokens.ts` — add `'/app/corporate'` to `DARK_MODE_ENABLED_PATH_PREFIXES`.
- `app/routes/corporate.tsx` — wire `useTheme`, add `<AppearanceToggle variant="cycle" />` in the header, run codemod and hand-fix hardcoded colors, status badges, and modals for dark contrast.

## Tasks
- [x] Add `'/app/corporate'` to `DARK_MODE_ENABLED_PATH_PREFIXES` in `app/config/theme-tokens.ts`
- [x] Wire `useTheme` in `app/routes/corporate.tsx` using the signed-in `currentUser` (`uid`, `themePreference`)
- [x] Add `<AppearanceToggle variant="cycle" preference={themePreference} onChange={setThemePreference} />` in the `app/routes/corporate.tsx` header next to `RoleViewSwitcher` / `UserDropdown`
- [x] Run `scripts/codemod-dark-tokens.mjs` on `app/routes/corporate.tsx`
- [x] Hand-fix leftover hardcoded classes, status badges (`formatRideStatusBadge`, invoice/PO badges), modals, and pending-assignment state for dark contrast while preserving `bg-slate-950` executive header and `print:` styles
- [x] Verify no unintended `bg-white` / `bg-slate-*` / `bg-gray-*` matches remain in `app/routes/corporate.tsx` (grep check)
- [x] Run `npm run typecheck`, `npx vitest run theme`, and `npm run build`

## Verification
- `npm run typecheck`
- `npx vitest run theme`
- `Select-String -Path app/routes/corporate.tsx -Pattern "bg-white|bg-slate-|bg-gray-"` (expect only justified matches such as the intentionally dark `bg-slate-950` / `bg-slate-900` executive header and `print:` statement surfaces)
- `npm run build`
- Manual: cycle Light/Dark/System via the header toggle in `/app/corporate`; confirm no flash on reload; verify Overview, Book Ride, Team & PO, Statements & Billing, modals, and print view; confirm `/driver` and live site remain unchanged.
