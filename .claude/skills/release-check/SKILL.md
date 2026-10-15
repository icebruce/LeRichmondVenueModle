---
name: release-check
description: Pre-merge checklist for Richmond Studio. Runs the full test suite, requirement traceability, scene budgets and the three reviewers, then updates PROJECT_STATUS.md and the pull request. Use before marking a step's pull request ready for the owner.
---

# Release check

Run in order; stop and fix at the first failure.

1. **Branch up to date:** merge the base branch if behind; resolve conflicts.
2. **Fast checks:** `npm run check` (typecheck, lint, unit).
3. **Build:** `npm run build` with no warnings about chunk size beyond the budget in `docs/ARCHITECTURE.md` §7.
4. **E2E + visual:** `npm run test:e2e` and `npm run test:visual`. A visual baseline may change only if the change is intended and reviewed.
5. **Traceability:** `npm run check:trace` — every M requirement of this step has a test or is marked manual with its gate.
6. **Budgets:** draw calls and triangles for the heavy scenario within limits.
7. **Reviews (parallel):** `spec-reviewer` on the diff; `ux-reviewer` and `fidelity-reviewer` via the `visual-qa` skill. Fix all Blockers and Majors.
8. **Docs:** `PROJECT_STATUS.md` step state, decisions and open items; spec edits only for real decisions.
9. **PR:** description lists requirement IDs delivered, what to look at in the Vercel preview, known limitations, and the render/reference pairs for the owner.
