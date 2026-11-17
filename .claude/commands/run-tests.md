---
description: Run the JobPilot AI verification suite and report results
argument-hint: "[optional vitest path filter]"
---

Run, in order, stopping at the first failure to diagnose it:

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test $ARGUMENTS`
4. `pnpm build` (with placeholder `NEXT_PUBLIC_SUPABASE_*` env if `.env.local` is absent)

Report each step as pass/fail with the decisive error lines. Do not modify tests to make them pass; fix the code or explain why the test is wrong.
