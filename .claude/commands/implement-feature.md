---
description: Implement a roadmap feature as one complete vertical slice
argument-hint: <feature or roadmap item>
---

Implement: $ARGUMENTS

1. Read `AGENTS.md`, the matching section of `docs/development-roadmap.md`, and the docs for the area.
2. Inspect existing code for the owning module; list files you will add or change. If the change adds a module, dependency or integration, get an `architect` review first.
3. Build in this order, verifying each step:
   - migration + migration test (if schema changes) — `database-management` skill
   - schemas + repository + actions/service + unit tests — `backend-development` skill
   - UI with loading/empty/error states — `frontend-development` skill
4. Run `pnpm check && pnpm build`. Fix everything you introduced.
5. Update docs touched by the change, `docs/changelog.md` (Unreleased) and the roadmap status.
6. Report: what changed, how it was verified, what could not be verified, remaining limitations.
