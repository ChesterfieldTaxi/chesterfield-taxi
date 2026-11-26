# Phase 93: Dark Mode for Admin

## Goal
Extend the Phase 92 semantic-token dark mode to the admin console (`/admin`), including the login page. Add a shared `AppearanceToggle` (moon/sun button) next to the "Site Controls" button, plus a full Light / Dark / System selector in admin settings.

## Design Decisions
- Reuse the Phase 92 foundation: tokens in `app/app.css`, `theme.service.ts`, `useTheme`, `theme-tokens.ts`, and `scripts/codemod-dark-tokens.mjs`. No new theme architecture.
- Extract a shared `AppearanceToggle` component (config-driven from the options array in `theme-tokens.ts`). Dispatch (`DispatchDesktopTopHeader.tsx`) and admin both consume it. Keep dispatch behavior unchanged.
- Admin header: moon/sun icon button next to "Site Controls" in `admin.tsx` (~line 477) that cycles Light → Dark → System. The mobile Site Controls sheet (~line 552) gets the same control.
- `admin.settings.tsx`: full Light / Dark / System selector.
- `admin.login.tsx` follows the theme via `useTheme` (localStorage cache, then `light`; no profile when signed out).
- Convert `app/components/domain/admin/**` (~3,100 hardcoded `bg-white` / `*-slate-*` / `*-gray-*` matches) using the codemod per subfolder, then hand-fix leftovers.
- Extend the codemod only if admin uses patterns it misses (`ring-*`, `divide-*`, `placeholder-*`, `hover:` / `focus:` variants).
- Out of scope: `components/domain/admin/website/**` previews stay light (only editor chrome around them is converted); map dark styling in places/zones/operators (deferred); passenger, corporate portal, driver, and live site.
- Charts and analytics need dark-tuned status/chart colors. Inline `style={{}}` and hex colors are not caught by the codemod, so list and hand-fix them.
- Work in checkpoints; run typecheck and the grep check after each.

## Files to Touch
- `app/components/ui/AppearanceToggle.tsx` (new) — shared moon/sun cycle button and selector variant, driven by `theme-tokens.ts` options.
- `app/components/domain/dispatch/workspace/DispatchDesktopTopHeader.tsx` — consume the shared component only if the swap is cheap.
- `app/routes/admin.tsx` — theme init, toggle next to Site Controls (desktop + mobile sheet), token conversion.
- `app/routes/admin.settings.tsx` — Appearance selector, token conversion.
- `app/routes/admin.login.tsx` — theme init, token conversion.
- `app/components/domain/admin/**` — token conversion (excluding `website/` previews).
- `scripts/codemod-dark-tokens.mjs` — extend patterns only if needed.
- `app/app.css` — extra tokens only if needed.

## Tasks
- [x] Checkpoint 1 (Shell): create `AppearanceToggle`; add to `admin.tsx` beside Site Controls (desktop + mobile sheet); init theme in `admin.tsx` and `admin.login.tsx`; add selector to `admin.settings.tsx`
- [x] Checkpoint 1: run codemod on the admin routes and `domain/admin/navigation`; hand-fix; typecheck
- [x] Optionally swap `DispatchDesktopTopHeader.tsx` to the shared `AppearanceToggle` (skip if risky)
- [x] Audit admin for patterns the codemod misses; extend `codemod-dark-tokens.mjs` if needed
- [x] Checkpoint 2 (Core data): run codemod on trips, customers, operators, vehicles, corporate, invoicing; hand-fix; typecheck
- [x] Checkpoint 3 (Config pages): run codemod on pricing, tariff, rules, general, integrations, subpages, analytics; tune chart/status colors; typecheck
- [x] Checkpoint 4 (Leftovers): places, zones (UI chrome only), website editor chrome (previews stay light); convert inline styles/hex colors; add any needed tokens
- [x] Grep check for leftover `bg-white` / `bg-slate-` / `*-gray-*` in admin (only justified matches such as website previews)
- [x] Confirm dispatch, passenger, corporate, and live site are unchanged

## Verification
- `npm run typecheck`
- `npx vitest run theme`
- `Get-ChildItem app\components\domain\admin,app\routes -Recurse -Include admin*.tsx,*.tsx | Select-String -Pattern "bg-white|bg-slate-|bg-gray-"` (expect no matches, or only justified ones such as website previews)
- `npm run build`
- Manual: toggle Light/Dark/System from the admin header, mobile sheet, and settings; confirm no flash on reload; check login, trips, customers, pricing, and analytics; confirm website previews stay light; confirm dispatch, passenger, corporate, and live site are unchanged.
