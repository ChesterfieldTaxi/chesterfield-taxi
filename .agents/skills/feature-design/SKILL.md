---
name: feature-design
description: Start a focused, cost-efficient feature design discussion grounded in constitution.md without reading archived docs or writing implementation code prematurely.
---

# Feature Design Discussion

Use this skill when the user wants to discuss, brainstorm, or design a new feature before implementing it.

## Rules & Cost Guardrails
1. **Read `constitution.md` first** to respect the tech stack, architectural constraints (config-driven UI, strict service/UI abstraction), and security/fixture hygiene.
2. **Do NOT read `docs/archive/` or `spec.md`** unless the user explicitly asks you to look up something specific in them.
3. **Inspect only relevant code:** Use targeted searches (`rg -n`) and read only the specific files or line ranges related to the feature area.
4. **No implementation code yet:** Stay in design mode until the user is ready to finalize the phase.

## Discussion Flow
1. **Clarify & Align:** Ask concise, targeted questions (using `ask_question` or short bulleted questions) to resolve:
   - User-facing behavior, routes, or UI entry points
   - Data model / Firestore schema or service interface changes
   - Edge cases, permissions/auth, and failure states
2. **Propose a Lean Design:** Once requirements are clear, present a concise summary of:
   - Recommended approach & how it fits `constitution.md`
   - Exact files likely to be created or modified
   - Any trade-offs or alternatives
3. **Handoff:** When the user confirms the design is ready, tell them you can finalize it into `docs/phases/phase-XX.md` and generate the execution prompt (using the `phase-prep` skill).
