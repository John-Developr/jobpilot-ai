# ADR-004: Feature-based folder structure

- **Status:** Accepted (2026-11-17)

## Context

The suggested structure had both `src/features/*` and global `src/server/{services,repositories,validators,policies,actions}`.
Splitting one feature across five global folders scatters related code and invites generic "utils" sprawl.

## Decision

```
src/
  app/                  routes only: (auth)/login, (app)/<module>, layouts, loading/error files
  components/ui         shadcn/ui primitives (generated, lightly themed)
  components/layout     app shell (nav, theme toggle, user menu)
  components/shared     cross-feature presentational blocks
  features/<feature>/   components/, server/ (repository, actions, services), schemas.ts
  server/               cross-cutting server code: auth guard, action results, errors
  lib/                  infrastructure: supabase/, scheduling/, monitoring/ (later ai/, integrations/, automation/)
  config/               env parsing, navigation
  types/                generated database types
tests/unit · tests/integration · tests/e2e (planned)
supabase/migrations
```

Deviations from the suggested structure:
- Route group is `(app)` instead of `(dashboard)` because `dashboard` is itself a route.
- No global `server/services|repositories|validators|policies|actions`; those live per feature.
  Authorization policy is RLS + `requireUser`; no separate policies layer until a rule spans features.
- Empty planned folders (`hooks/`, `charts/`, `lib/ai/` …) are not created until they have content.
- Changelog lives at `docs/changelog.md`.

## Alternatives

Global layer folders (rejected above); one flat `src/` per Next.js defaults (too coarse for ~10 modules).

## Consequences

Features import from `@/server`, `@/lib`, `@/components`; features may import another feature's public
components/types (e.g. dashboard uses settings), but never its internals beyond `server/*-repository` reads.
