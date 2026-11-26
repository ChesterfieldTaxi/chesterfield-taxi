# Phase 96: Live Site Dark Mode

## Goal
Extend the semantic-token dark mode foundation to the public live site (`/` and all public routes under `app/routes/layout.tsx`). Honor `darkTokens` per brand theme with automatic dark fallbacks for custom brands, and provide a config-driven visitor appearance toggle (`Light` / `Dark` / `System`, defaulting to `light`) in the public navigation.

## Design Decisions
- **Route scope & pre-hydration:** Extend `DARK_MODE_ENABLED_PATH_PREFIXES` / `isDarkModeRoutePath()` in `app/config/theme-tokens.ts` to cover all public live-site routes (`/`, `/about`, `/book`, `/booking`, `/contact`, `/pay`, `/privacy`, `/register`, `/service-areas`, `/services`, `/signin`, `/terms`, `/track`, `/construction`) while keeping `/driver` excluded. The existing `buildPreHydrationThemeScript()` in `app/root.tsx` prevents any flash of light theme on reload.
- **Brand `darkTokens` + custom-brand fallback:** Add `darkTokens?: Partial<BrandingConfig>` to `BrandingConfig` in `app/core/types/config.ts` and populate `darkTokens` for all 6 presets in `app/components/domain/admin/website/theme-presets.ts`. Add a pure `resolveEffectiveBranding(branding, resolvedTheme)` helper in `app/services/theme.service.ts` that merges `darkTokens` when `resolvedTheme === 'dark'` and computes safe dark surface/text fallbacks for custom brands without `darkTokens`, preserving `primaryColor`, fonts, and `btnBorderRadius`.
- **Live CSS variable sync:** Wire `useTheme().resolvedTheme` into `resolveEffectiveBranding()` in both `app/routes/layout.tsx` (`PublicLayout`) and `app/root.tsx` (`useDynamicBrandingSync`) so `--card-bg`, `--color-heading`, `--color-text-main`, `--color-text-muted`, `--navbar-bg`, and secondary button tokens update immediately on toggle.
- **Visitor appearance toggle:** Add a compact, config-driven appearance switcher consuming `APPEARANCE_OPTIONS` and `useTheme()` in `app/components/layout/Navbar.tsx` (desktop bar + mobile menu) and `app/components/layout/Footer.tsx`. Visitors with no saved preference default to `light`; changes persist in `localStorage` (`ct_theme_preference`) and sync to Firestore if signed in.
- **Token conversion scope:** Convert all public routes under `layout.tsx` plus `Navbar.tsx`, `Footer.tsx`, `app/components/cms/**`, and `app/components/domain/booking/**` from hardcoded `bg-white`, `bg-slate-*`, `text-slate-*`, and `border-slate-*` classes to semantic tokens (`bg-surface-*`, `text-fg-*`, `border-edge-*`) and brand CSS variables (`--card-bg`, `--color-heading`, etc.).
- **Out of scope:** `/driver` routes and adding a dark-token editor UI to `WebsiteThemesTab.tsx`.

## Files to Touch
- `app/config/theme-tokens.ts` — extend `DARK_MODE_ENABLED_PATH_PREFIXES` / `isDarkModeRoutePath` to include all public live-site routes (excluding `/driver`).
- `app/core/types/config.ts` — add `darkTokens?: Partial<BrandingConfig>` to `BrandingConfig`.
- `app/components/domain/admin/website/theme-presets.ts` — add `darkTokens` to all 6 `THEME_PRESETS`; ensure `hydrateBrandingFromSettings` preserves `darkTokens` when present.
- `app/services/theme.service.ts` — add pure `resolveEffectiveBranding(branding, resolvedTheme)` helper with preset `darkTokens` merge and custom-brand dark fallback.
- `app/routes/layout.tsx` — use `bg-surface-page text-fg-primary` and resolve branding via `resolveEffectiveBranding(branding, resolvedTheme)`.
- `app/root.tsx` — update `useDynamicBrandingSync()` to resolve branding with the current `resolvedTheme` and re-apply on `THEME_CHANGE_EVENT` / `storage` changes.
- `app/components/layout/Navbar.tsx`, `app/components/layout/Footer.tsx` — add config-driven `APPEARANCE_OPTIONS` toggle via `useTheme()` and convert hardcoded light colors to semantic tokens.
- `app/routes/_index.tsx`, `app/routes/book.tsx`, `app/routes/booking.status.tsx`, `app/routes/services.tsx`, `app/routes/about.tsx`, `app/routes/contact.tsx`, `app/routes/service-areas._index.tsx`, `app/routes/service-areas.$corridorSlug.tsx`, `app/routes/track.tsx`, `app/routes/pay.$payToken.tsx`, `app/routes/signin.tsx`, `app/routes/register.tsx`, `app/routes/privacy.tsx`, `app/routes/terms.tsx`, `app/routes/construction.tsx` — convert hardcoded colors to semantic tokens / brand CSS variables.
- `app/components/cms/**`, `app/components/domain/booking/**` — convert hardcoded colors to semantic tokens / brand CSS variables.
- Unit test file for `theme.service.ts` / `theme-tokens.ts` (locate existing theme tests with `git grep`) — add tests for `resolveEffectiveBranding` and public route matching.

## Tasks
- [x] Extend `DARK_MODE_ENABLED_PATH_PREFIXES` / `isDarkModeRoutePath()` in `app/config/theme-tokens.ts` for all public live-site routes (keeping `/driver` excluded).
- [x] Add `darkTokens?: Partial<BrandingConfig>` to `BrandingConfig` in `app/core/types/config.ts`, populate `darkTokens` on all 6 `THEME_PRESETS` in `theme-presets.ts`, and preserve `darkTokens` in `hydrateBrandingFromSettings`.
- [x] Implement pure `resolveEffectiveBranding(branding, resolvedTheme)` in `app/services/theme.service.ts` (merges `darkTokens` in dark mode, with safe dark surface/text fallbacks for custom brands).
- [x] Wire `resolveEffectiveBranding` and `useTheme()` into `app/routes/layout.tsx` and `app/root.tsx` (`useDynamicBrandingSync`), and update `PublicLayout` root classes to semantic tokens.
- [x] Add config-driven visitor appearance switcher (`APPEARANCE_OPTIONS` + `useTheme()`) to `app/components/layout/Navbar.tsx` (desktop + mobile) and `app/components/layout/Footer.tsx`.
- [x] Run `node scripts/codemod-dark-tokens.mjs` scoped to `app/components/layout`, `app/components/cms`, `app/components/domain/booking`, and public `app/routes/*.tsx` files, then hand-fix leftovers (hero/card contrast, `--card-bg`, status badges, forms).
- [x] Add unit tests for `resolveEffectiveBranding` (preset `darkTokens` + custom-brand fallback) and `isDarkModeRoutePath` (public routes included, `/driver` excluded).
- [x] Run verification commands and verify zero unintended `bg-white` / `bg-slate-` leftovers in public routes/components.

## Verification
- `npm run typecheck`
- `npx vitest run theme`
- `Get-ChildItem app/routes/_index.tsx, app/routes/book.tsx, app/routes/booking.status.tsx, app/routes/services.tsx, app/routes/about.tsx, app/routes/contact.tsx, app/routes/service-areas._index.tsx, app/routes/service-areas.`$corridorSlug.tsx, app/routes/track.tsx, app/routes/pay.`$payToken.tsx, app/routes/signin.tsx, app/routes/register.tsx, app/routes/privacy.tsx, app/routes/terms.tsx, app/routes/construction.tsx, app/routes/layout.tsx | Select-String -Pattern "bg-white|bg-slate-"` (expect no or only justified matches)
- `npm run build`
