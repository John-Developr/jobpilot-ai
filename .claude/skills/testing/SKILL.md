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
- AI: schema-invalid output rejected; grounding flags unsupported skills and numbers; tool rounds, invalid tool arguments, step limit, streamed chunks; key/model failover (429, rejected key, 404, 503) and "all keys parked".
- Assistant: tools are read-only and scoped to the user; progress steps follow real events; NDJSON parsing.
- Automation: CAPTCHA/login/changed-page → `needs_attention`, never `applied` (Phase 7+).

## Patterns

- **DB tests:** `createMigratedDatabase()`, `createUser(db, email)`, `asUser(db, userId, fn)` from `tests/integration/db/harness.ts`. Assert that other users see nothing and that forbidden writes fail with `permission denied`.
- **AI tests:** mock `openai` (a class whose `chat.completions.create` is a `vi.fn()`) and `@/config/server-env` (`aiCredentials`, `aiModelOverrides`, `AI_KEY_VARIABLE`); stream responses with an async generator. See `tests/unit/assistant/run-conversation.test.ts`. Use fresh key values per test so parked keys do not leak.
- **server-only modules:** `vi.mock("server-only", () => ({}))` before importing.
- **Env in tests:** Vitest does not load `.env.local`. Committed tests never call real providers; for a one-off live check, run a temporary test with `(set -a; . ./.env.local; set +a; pnpm exec vitest run <file>)`, then delete it and never print keys.

## Commands

```
pnpm test                 # all unit + integration
pnpm test:watch           # watch mode
pnpm exec vitest run tests/unit/scheduling   # one area
```
