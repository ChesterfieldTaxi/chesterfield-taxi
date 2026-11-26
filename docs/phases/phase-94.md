# Phase 94: Dark Mode for Client Portal

## Goal
Extend the Phase 92/93 semantic-token dark mode to the passenger client portal (`/app/passenger`) and its authentication/hub flow (`/app/login`, `/app/register`, `/app/hub`). Add a full Light / Dark / System selector inside the Profile & Preferences tab while keeping the public live site, corporate portal, and driver portal visually unchanged.

## Design Decisions
- Reuse the Phase 92/93 foundation: semantic tokens in `app/app.css`, `theme.service.ts`, `useTheme`, `AppearanceToggle` (`variant="selector"`), `theme-tokens.ts`, and `scripts/codemod-dark-tokens.mjs`. No new theme architecture.
- Extend `DARK_MODE_ENABLED_PATH_PREFIXES` in `app/config/theme-tokens.ts` with `'/app/passenger'`, `'/app/login'`, `'/app/register'`, and `'/app/hub'` so `root.tsx` pre-hydration and `theme.service.ts` apply `.dark` across the full client auth & portal flow without flashing light mode on reload.
- `app/routes/app.tsx`: wire `useTheme` with the signed-in user's `uid` and `themePreference` from `getAdminAuthService()`, syncing `localStorage` (`ct_theme_preference`) and the Firestore user profile.
- `app/routes/app.hub.tsx`: wire `useTheme` with the signed-in `AdminUser` (`uid`, `themePreference`) if present.
- `app/routes/app.login.tsx` and `app/routes/app.register.tsx`: call `useTheme()` so unauthenticated auth pages follow the cached `localStorage` / `system` preference.
- UI entry point: add an **Appearance** section inside the **Profile & Preferences** tab in `app/routes/app.tsx` using `<AppearanceToggle variant="selector" preference={themePreference} onChange={setThemePreference} />` (driven by `APPEARANCE_OPTIONS`). No top-bar toggle in the passenger header.
- Shared components: convert `UserDropdown.tsx`, `BookingEngineV2.tsx`, and `PriceBreakdownPanel.tsx` to semantic tokens so they render cleanly in dark mode on `/app/passenger` while remaining visually identical on `/book` and `/corporate` (where `isDarkModeRoutePath` keeps `.dark` off).
- Out of scope: `/corporate`, `/app/corporate`, `/driver`, and public live-site routes (`/`, `/book`, etc.).

## Files to Touch
- `app/config/theme-tokens.ts` — add `'/app/passenger'`, `'/app/login'`, `'/app/register'`, and `'/app/hub'` to `DARK_MODE_ENABLED_PATH_PREFIXES`.
- `app/routes/app.tsx` — initialize `useTheme`, add Appearance selector (`AppearanceToggle` `variant="selector"`) in Profile & Preferences tab, convert hardcoded colors to semantic tokens (including modals/bottom sheets and status badges).
- `app/routes/app.hub.tsx` — initialize `useTheme`, convert hardcoded colors to semantic tokens.
- `app/routes/app.login.tsx` — initialize `useTheme`, convert hardcoded colors to semantic tokens.
- `app/routes/app.register.tsx` — initialize `useTheme`, convert hardcoded colors to semantic tokens.
- `app/components/domain/common/UserDropdown.tsx` — convert hardcoded colors to semantic tokens.
- `app/components/domain/BookingEngineV2.tsx` — convert hardcoded colors to semantic tokens.
- `app/components/domain/booking/PriceBreakdownPanel.tsx` — convert hardcoded colors to semantic tokens.

## Tasks
- [x] Add `'/app/passenger'`, `'/app/login'`, `'/app/register'`, and `'/app/hub'` to `DARK_MODE_ENABLED_PATH_PREFIXES` in `app/config/theme-tokens.ts`
- [x] Wire `useTheme` in `app/routes/app.tsx`, `app.hub.tsx`, `app.login.tsx`, and `app.register.tsx`
- [x] Add Appearance section with `<AppearanceToggle variant="selector" ... />` in `app/routes/app.tsx` Profile & Preferences tab
- [x] Run `scripts/codemod-dark-tokens.mjs` on `app/routes/app.tsx`, `app.hub.tsx`, `app.login.tsx`, `app.register.tsx`, `UserDropdown.tsx`, `BookingEngineV2.tsx`, and `PriceBreakdownPanel.tsx`
- [x] Hand-fix any leftover hardcoded classes, modals/bottom sheets, inline styles, and status badges for dark contrast
- [x] Verify no unintended `bg-white` / `bg-slate-*` / `bg-gray-*` matches remain in the touched files (grep check)
- [x] Run `npm run typecheck`, `npx vitest run theme`, and `npm run build`

## Verification
- `npm run typecheck`
- `npx vitest run theme`
- `Select-String -Path app/routes/app.tsx,app/routes/app.hub.tsx,app/routes/app.login.tsx,app/routes/app.register.tsx,app/components/domain/common/UserDropdown.tsx,app/components/domain/BookingEngineV2.tsx,app/components/domain/booking/PriceBreakdownPanel.tsx -Pattern "bg-white|bg-slate-|bg-gray-"` (expect no matches, or only justified ones such as brand/active-trip gradient cards)
- `npm run build`
- Manual: toggle Light/Dark/System in `/app/passenger` Profile & Preferences; confirm no flash on reload; verify `/app/login`, `/app/register`, `/app/hub`, booking flow, saved places, and bottom sheets in dark mode; confirm `/book`, `/corporate`, `/driver`, and live site remain unchanged.
