# Phase 97: Help Documentation & Guides Foundation

## Goal
Deliver a config-driven, role-scoped Help system for the Admin, Dispatch, and Client/Corporate portals: typed guide content (workflows, feature reference, FAQ/troubleshooting, keyboard shortcuts, screenshots) plus a shared, searchable, context-aware slide-over Help Drawer opened from a `?` button in each portal header.

## Design Decisions
- **Config-driven content:** All guides live in typed TypeScript config under `app/config/help/` (no hardcoded guide JSX). Content blocks: numbered steps, reference tables, FAQ accordions, shortcut tables, screenshots.
- **Strict abstraction:** `app/services/help.service.ts` owns role scoping, keyword search, and context-to-guide lookup. UI components only consume the service and config types. The data source is hidden so a later move to Firestore does not touch the UI.
- **Static config, not Firestore:** Guides are version-controlled with code and add no Firestore reads.
- **Role scoping:** `admin` sees Admin + Dispatch + Client/Corporate guides; `dispatch` sees Dispatch only; `passenger`/`corporate` see Passenger & Corporate only.
- **UI:** One slide-over `HelpDrawer` plus `HelpTriggerButton` (`?`) mounted in each portal header. Contextual: opens to the guide matching the active portal/tab/pane (e.g. Admin tab + sub, Dispatch pane), with a back button to browse all permitted guides. Client-side search over title, tags, steps, and FAQs, with content-type filters (Workflows, Reference, Troubleshooting & FAQ, Shortcuts).
- **Screenshots:** Each guide may define `{ src: '/images/help/<portal>/<slug>.png', alt, caption }`. The UI renders a clean placeholder frame if the image fails to load or is missing. Real captures can be added later without code changes.
- **Performance:** `HelpDrawer` and guide configs are lazy-loaded on first open (`React.lazy` / dynamic import) so portal initial bundles are unaffected.
- **Guide coverage:**
  - Admin: Dashboard & Analytics, Trips & Audit, General & Branding, Rates & Tariffs, Vehicles & Fleet, Zones & Places, Operators & Drivers, Rules & Auto-Dispatch, Website/CMS, Invoicing & Corporate, Advanced & Integrations.
  - Dispatch: 3-Pane Workspace & Popout, Trip Queue & Status Lifecycle, Driver Assignment & Conflict Resolution, Live Map & Roster, Comms Hub & Call HUD, Email Dock & Standing Orders, Keyboard Shortcuts.
  - Client/Corporate: Booking & Saved Places, Live Tracking, Saved Cards & Payments, Corporate Team & Cost Centers, Corporate Invoicing & Statements, Profile & Notifications.
- **Accuracy:** Write guide content from the actual UI. Before writing each portal's guides, read that portal's tab/pane labels and status values in code. Do not invent features. Mark any uncertain behavior in the guide as "verify".
- **Out of scope:** Firestore-backed/admin-editable help, capturing real screenshots, `/driver` portal help, public-site help.

## Files to Touch
- `app/config/help/types.ts` — `HelpGuide`, `HelpStep`, `HelpFaq`, `HelpShortcut`, `HelpScreenshot`, `HelpPortalScope`, `HelpRole`, `HelpContext` types.
- `app/config/help/adminGuides.ts` — Admin guides.
- `app/config/help/dispatchGuides.ts` — Dispatch guides and shortcuts.
- `app/config/help/clientGuides.ts` — Passenger & Corporate guides.
- `app/config/help/index.ts` — aggregated registry export.
- `app/services/help.service.ts` — `getGuidesForRole`, `searchGuides`, `resolveGuideForContext`.
- `app/components/domain/common/HelpDrawer.tsx` — slide-over Help UI (browse, search, filter, guide detail, screenshot placeholder).
- `app/components/domain/common/HelpTriggerButton.tsx` — header `?` button.
- `public/images/help/.gitkeep` — screenshot asset directory.
- `app/routes/admin.tsx` — mount trigger and drawer with `normalizedTab` / `effectiveSub` context.
- `app/routes/dispatch.tsx` — mount trigger and drawer with dispatch context.
- `app/routes/app.tsx` — mount trigger and drawer (passenger).
- `app/routes/corporate.tsx` — mount trigger and drawer (corporate).
- Help service unit test (e.g. `app/services/help.service.test.ts`, matching the repo's existing test location convention) — role scoping, search, context lookup.

## Tasks
- [x] Define help types in `app/config/help/types.ts`.
- [x] Implement `help.service.ts` (role scoping, search, context resolution) and its unit tests.
- [x] Write `adminGuides.ts` after reading admin tab and sub-page keys in `admin.tsx`.
- [x] Write `dispatchGuides.ts` (workflows, status lifecycle, shortcuts) after reading the dispatch panes and any existing key handlers.
- [x] Write `clientGuides.ts` (passenger and corporate) after reading `app.tsx` and `corporate.tsx` sections.
- [x] Add `config/help/index.ts` registry and `public/images/help/.gitkeep`.
- [x] Build `HelpTriggerButton` and `HelpDrawer`, using the existing `ui/` components and semantic dark-mode tokens, with search, filters, accordions, shortcut tables, screenshot placeholder, and lazy loading.
- [x] Mount trigger and drawer in `admin.tsx`, `dispatch.tsx`, `app.tsx`, and `corporate.tsx` with context mapping and role passing.
- [x] Add a test that every guide has a unique id, a non-empty title, and at least one content block. Add one that context keys resolve to existing guides.
- [x] Run verification and check off tasks.

## Verification
- `npm run typecheck`
- `npx vitest run help`
- `npm run build`
