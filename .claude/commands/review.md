---
description: Review current changes against JobPilot AI rules
argument-hint: "[path or git ref, default: working tree]"
---

Review ${ARGUMENTS:-the current working tree changes} (`git diff` and untracked files).

Check, in order:
1. Business-critical invariants in `AGENTS.md` (approval, schedule window with server time, pause, verified submissions, idempotency, no CAPTCHA bypass, no invented profile data).
2. Authorization: `requireUser()` at every entry point, RLS + grants on new tables, no service-role use in request paths.
3. Validation at boundaries, `ActionResult` usage, error logging without sensitive data.
4. Design system: tokens only, shared components reused, loading/empty/error states, accessibility.
5. Tests exist for new business logic and constraints; docs and changelog updated.

Output one line per finding: `path:line — severity — problem — fix`. No praise, no style nits unless they hide a bug.
