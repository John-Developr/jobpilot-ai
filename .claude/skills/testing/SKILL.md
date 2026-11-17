---
name: testing
description: How to test JobPilot AI — Vitest unit tests, PGlite migration/RLS tests, Playwright e2e, deterministic time, and the required coverage areas for business-critical rules. Load before writing or running tests.
---

# Testing

## Layout

| Kind | Path | Runs with |
| --- | --- | --- |
| Unit | `tests/unit/**/*.test.ts` | `pnpm test` |
| DB / migrations | `tests/integration/db/*.test.ts` | `pnpm test` (PGlite, no Docker) |
| E2E | `tests/e2e/` (Planned) | Playwright against a Supabase test project |

## Rules

- Inject time. Business logic takes `now: Date`; tests build instants with explicit offsets (`new Date("2026-11-16T09:00:00+08:00")`).
- Never rely on the machine timezone or real network.
- Assert on constraint names / error classes, not just "throws".
- One behavior per test; name tests as the rule they protect.

## Required coverage (grow with each phase)

- Scheduling: start inclusive, end exclusive, weekends, next-window rollover, mid-task cutoff, timezone, DST, pause, disabled.
- Data integrity: dedupe, one application per job, cross-user FK rejection, verified-submission check.
- Authorization: RLS isolation, column grants, anon denied.
- AI: schema-invalid output rejected; hallucinated skills flagged (Phase 4+).
- Automation: CAPTCHA/login/changed-page → `needs_attention`, never `applied` (Phase 7+).

## Commands

```
pnpm test                 # all unit + integration
pnpm test:watch           # watch mode
pnpm exec vitest run tests/unit/scheduling   # one area
```
