# AGENTS.md — repository rules for every coding agent

JobPilot AI is a single-user, AI-assisted job application platform (Next.js 16 + Supabase).
These rules apply to any agent or human working in this repo. `CLAUDE.md` adds
Claude Code–specific workflow on top of this file.

## Before you change anything

1. Read `docs/development-roadmap.md` (what exists, what is planned) and the docs for the area you touch.
2. Inspect existing code before creating files. Extend the owning module; do not duplicate logic.
3. Never assume a feature exists because a doc describes it — docs mark planned work as **Planned**.

## Commands

| Task | Command |
| --- | --- |
| Install | `pnpm install` |
| Dev server | `pnpm dev` (needs `.env.local`, see `.env.example`) |
| Lint / types / tests | `pnpm lint` · `pnpm typecheck` · `pnpm test` |
| Everything CI runs | `pnpm check && pnpm build` |
| Regenerate DB types | `pnpm db:types` (requires a linked Supabase project) |

`pnpm test` runs unit tests and migration tests. Migration tests execute every file in
`supabase/migrations` against in-memory Postgres (PGlite) with Supabase stubs, so schema,
RLS and grants are verified without Docker.

## Architecture rules

- **Feature modules** live in `src/features/<feature>/` with `components/`, `server/` (repositories, actions, services) and `schemas.ts` (Zod). See `docs/architecture/architecture-decisions/ADR-004-folder-structure.md`.
- **Cross-cutting server code**: `src/server/` (auth guard, action results, errors). **Infrastructure**: `src/lib/` (Supabase clients, scheduling, monitoring, later AI/automation).
- **Server first.** Server Components by default; `"use client"` only for interaction. Cache Components is on: anything that reads cookies/session must render inside `<Suspense>` (use a route `loading.tsx`).
- **Every server read/write starts with `requireUser()`** (`src/server/auth.ts`). The proxy redirect is a convenience, not authorization. RLS is the final guard.
- **Validate at boundaries** with Zod: Server Action input, external API payloads, AI outputs. Server Actions return `ActionResult` (`src/server/action-result.ts`); never throw raw errors to the client.
- **Schedule logic has one home:** `src/lib/scheduling/submission-window.ts`. Never re-implement working-hours checks.
- **Logging:** `logger` from `src/lib/monitoring/logger.ts`, event names `area.subject.outcome`. Never log secrets, tokens or document contents.

## Business-critical invariants (do not weaken)

- No submission without explicit human approval (current release).
- Submissions only inside the configured window (default Mon–Fri 09:00–17:00 Asia/Manila), checked with **server time immediately before the final submit action**. End time is exclusive.
- Emergency pause blocks all submissions immediately.
- Never mark an automated submission as applied unless verified (`submission_verified_at`; enforced by a DB check constraint).
- One application per job (unique constraint); idempotency keys and locks are service-role–only columns.
- Never bypass CAPTCHA, anti-bot measures, logins or platform restrictions. Stop and ask the human.
- Generated resumes/cover letters use only verified profile data. Never invent experience, skills or achievements.

## Database

- All changes go through a new file in `supabase/migrations/` (`YYYYMMDDHHMMSS_description.sql`). Never edit an applied migration; never change production schema by hand.
- Every user-owned table has `user_id`, RLS enabled, and an owner policy using `(select auth.uid())`. Child tables use composite FKs `(parent_id, user_id)`.
- Add a migration test in `tests/integration/db/` for new constraints, policies or grants.
- Update `docs/database/database-schema.md` and `src/types/database.ts` in the same change.

## Design system

- Use tokens from `src/app/globals.css` through Tailwind utilities (`bg-card`, `text-muted-foreground`, `bg-success-soft` …). No raw hex values, no arbitrary colors in components.
- Reuse `src/components/shared/*` (PageHeader, SectionCard, EmptyState, ErrorState) and `src/components/ui/*` (shadcn/ui). Read `docs/design/` before adding UI patterns.
- Every data view needs loading, empty and error states. No fake data, fake statistics or non-functional buttons; unbuilt modules stay out of navigation (`plannedPhase` in `src/config/navigation.ts`).

## Code standards

- Strict TypeScript. No `any`, no unchecked `as` casts on external data.
- Small focused components; business logic stays out of components.
- Prefer platform/standard library over new dependencies; justify any new dependency in the PR.

## Definition of done

Requirements met · UI with loading/empty/error states · server validation + authorization ·
migration + migration test (if schema changed) · tests for business logic · `pnpm check && pnpm build` pass ·
docs updated · `docs/changelog.md` updated under **Unreleased** · limitations recorded in the roadmap.

Report honestly: say what was verified and how; never claim something ran if only code was written.

## Safety

- Never commit secrets. `.env*` is git-ignored except `.env.example`.
- Ask before destructive operations, production database changes, or anything with external effects (sending email, submitting applications, pushing, deploying).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
