---
description: Sync documentation, changelog and roadmap with the code
argument-hint: "[area or change summary]"
---

Update documentation for: ${ARGUMENTS:-the changes in the working tree}

1. Diff the code (`git status`, `git diff`) to see what actually changed.
2. Update the docs for each touched area (`docs/architecture`, `docs/database`, `docs/api`, `docs/ai`, `docs/automation`, `docs/design`, `docs/security`).
3. Add `docs/changelog.md` entries under `[Unreleased]`.
4. Update `docs/development-roadmap.md` status, limitations and technical debt.
5. Remove or mark **Planned** anything the docs claim that the code does not do.
Keep it concise. Never document unimplemented behavior as existing.
