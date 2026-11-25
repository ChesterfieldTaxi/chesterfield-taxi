# Constitution: Chesterfield Taxi Web Booking Portal

## Agent & Cost Guardrails
- **Scope:** Work ONLY on the phase/task explicitly requested in the user's prompt. Do not refactor unrelated phases or files.
- **Targeted Reading:** Never read `plan.md`, `tasks.md`, or `spec.md` in full. Search for the specific Phase heading first (`rg -n "## Phase X"`) and read only that section.
- **Targeted Verification:** Run `npm run typecheck` and only the specific test/build command needed for this phase. Do not dump full build logs unless a check fails.
- **End-of-Phase Handoff:** When done, check off completed items in `tasks.md` and output a 5-line summary (files changed, checks run, any open items) so this chat can be closed.

## 1. Tech Stack
- **Framework:** React Router v7 (Framework Mode) via Vite
- **Styling:** Tailwind CSS v4
- **Hosting:** Vercel (Public Web Hosting)
- **Database/Auth:** Firebase (Firestore / Firebase Auth) (for Phase 2 console integration)
- **Email/Notifications:** Resend

## 2. Architectural Constraints
- **Config-Driven UI:** UI generation and multi-step form rendering must heavily rely on configuration objects (e.g., forms, steps, validation schemas, and pricing configurations) rather than hardcoded JSX. This ensures maximum maintainability and flexibility for future updates.
- **Strict Abstraction:** Domain logic must not leak into UI components. UI components strictly consume services and configurations.
- **No Executable Code Yet:** This document, alongside the accompanying SDD documents, explicitly outlines the project constraints. Implementation code will follow strictly after specification approval.

## 3. Security & Test Fixture Hygiene
- **Zero Secret-Shaped Literals in Code or Tests:** Never commit real credentials or synthetic placeholder strings shaped like live provider tokens (e.g., `AC` + 32 hex chars, `SK` + 32 hex chars, `sk_live_`/`sk_test_`, `rk_live_`/`rk_test_`, raw `whsec_` base64, raw `re_` keys, `SG.`, `AKIA`, or PEM private keys) in `app/` or `scripts/`. Always use explicit non-hex fixture labels such as `AC_TEST_FIXTURE`, `SK_TEST_FIXTURE`, `whsec_test_fixture`, or `re_test_fixture` so automated secret scanners and GitHub Push Protection are never tripped by mock data.
