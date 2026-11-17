# Testing strategy

## Pyramid

| Level | Tool | Scope | Status |
| --- | --- | --- | --- |
| Unit | Vitest | Pure business logic (scheduling, scoring math, normalization, state machine) | Active |
| Database | Vitest + PGlite | Real migrations: constraints, triggers, RLS, grants, storage policies | Active |
| Integration | Vitest | Repositories/services with a Supabase test project or fakes at the HTTP boundary | Planned (Phase 2) |
| End-to-end | Playwright | Sign-in, settings, core flows against a Supabase test project | Planned (Phase 2) |
| Automation | Playwright | Flow adapters against saved HTML fixtures of supported forms | Planned (Phase 7) |

## Principles

- Business-critical rules get exhaustive boundary tests (see [test-cases.md](test-cases.md)).
- Time is injected; tests never read the host clock or timezone.
- No network in unit/DB tests.
- A test that fails is fixed at the cause; tests are not weakened to pass.

## CI

`.github/workflows/ci.yml` runs lint, typecheck, `pnpm test` and build on every push to `main` and every PR.

## Commands

`pnpm test` · `pnpm test:watch` · `pnpm check` (lint + typecheck + test).
