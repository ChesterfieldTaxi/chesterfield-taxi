---
name: phase-prep
description: End a feature design discussion by saving the finalized plan, file list, task checklist, and verification steps to docs/phases/phase-XX.md and outputting an execution prompt for a fresh coding chat.
---

# Phase Prep (Finalize Design & Generate Execution Prompt)

Use this skill when the user wants to wrap up a design discussion and prepare a self-contained phase document and execution prompt.

## Steps

1. **Determine the next phase number:**
   - List `docs/phases/` to find the highest existing `phase-XX.md` number and increment by 1 (or use the phase number specified by the user; if `docs/phases/` is empty, check `docs/archive/` filenames/headings or ask the user for the starting phase number).
2. **Create `docs/phases/phase-XX.md`** with this exact structure:
   ```markdown
   # Phase XX: <Short Feature Title>

   ## Goal
   <2-3 sentences describing what this phase delivers.>

   ## Design Decisions
   - <Key architectural/UX decisions agreed upon during design>

   ## Files to Touch
   - `path/to/file.ts` — <what changes>

   ## Tasks
   - [ ] <Concrete, ordered implementation step>
   - [ ] <Next step>

   ## Verification
   - `<exact command, e.g. npm run typecheck>`
   - `<any targeted test or build command>`
   ```
3. **Output a ready-to-copy Execution Prompt** for a fresh coding chat in a fenced code block, including:
   - Instruction to read `constitution.md` and `docs/phases/phase-XX.md` **only** (do NOT read `docs/archive/` or `spec.md`)
   - Instruction to implement only the tasks in `docs/phases/phase-XX.md`
   - Instruction to run the Verification commands, check off completed `[x]` items in `docs/phases/phase-XX.md`, and stop with:
     - A brief summary of files changed and checks run
     - A concise, ready-to-copy `git commit -m "..."` command (do NOT run `git commit` or `git push` automatically)
   - A **Recommended Model** note (e.g., `Hydrogen Medium` for standard UI/CRUD/wiring, or `Carbon Medium/High` for complex state machines, security rules, or multi-service refactors).
