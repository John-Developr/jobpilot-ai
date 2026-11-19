# AGENTS.md — repository rules for every coding agent

JobPilot AI is a single-user, AI-assisted job application platform (Next.js 16 + Supabase).
These rules apply to any agent or human working in this repo. `CLAUDE.md` adds
Claude Code–specific workflow on top of this file.

## Where things stand

Implemented: auth and app shell, settings and submission-window engine, profile and resumes, read-only portfolio
sync, job discovery (Remote OK, Greenhouse, Lever, Ashby, manual), AI evaluation, Application Studio, the
Ask JobPilot assistant, and the Phase 6 approval queue (state machine, approval, worker claim contract). Planned:
Phase 7 background worker (Trigger.dev) and browser automation (Playwright), Phase 8 analytics/notifications/monitoring, Phase 9 hardening. Source of truth:
`docs/development-roadmap.md`.

| Feature module | Owns |
| --- | --- |
| `settings` | `automation_settings`, scoring weights, emergency pause |
| `profile`, `resumes` | Verified candidate data; portfolio sync (`portfolio-sync-service.ts`) |
| `jobs` | Sources, ingestion (`ingest_jobs` RPC), listing view `job_listings` |
| `evaluation` | Scoring math (`scoring.ts`), `loadCandidateContext` (the only loader of profile facts for AI) |
| `studio` | Versioned documents, screening answers, grounding check, ready-for-approval gate |
| `applications` | Approval, queue state (`queue.ts`), manual submission, activity; status changes only via SQL functions (`approve_application`, …) |
| `assistant` | Ask JobPilot: read-only tools, threads/messages, streaming endpoint |
| `dashboard` | Read-only summary cards |

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
- **Mutations** go through `runAction` (`src/server/run-action.ts`): auth → Zod → run → log → `refresh()`. Server Actions cannot stream; when the UI needs live progress, use a Route Handler that streams NDJSON (pattern: `src/app/api/assistant/messages/route.ts`) and checks the request origin itself (Server Actions do that automatically, Route Handlers do not).

## AI rules

- **One entry point:** every model call goes through `src/lib/ai/run-structured.ts` (`runStructured` for JSON output, `runConversation` for tool calling with streamed progress). Features never import the `openai` SDK.
- **Provider-neutral:** calls use the Chat Completions API so Gemini (default, OpenAI-compatible endpoint) and OpenAI share one path. Never use the Responses API or provider-only features.
- **Failover is central:** keys (`GEMINI_API_KEY`, `GEMINI_API_KEY2`, …) and models (`PROVIDERS.gemini.defaultModels` or `AI_MODEL`) are handled by `src/lib/ai/key-pool.ts` via `withFailover`. Do not catch 429/401/404/503 in features. Record `result.model` (the model that actually answered), not `prompt.model`.
- **Prompts** are rows in `prompt_versions`; change behavior with a new version in a migration. Every stored output keeps `model` and `prompt_version_id`; every call writes one `ai_usage_events` row.
- **Schemas:** output and tool schemas must work in strict mode: all properties required, use `.nullable()` for optional. Gemini receives schemas without bounds (`relaxJsonSchema`) and may omit nullable tool arguments (`withOmittedAsNull`), so Zod re-validation after the call is mandatory.
- **Grounding:** only verified profile facts from `loadCandidateContext` reach the model; never send email, phone, address or links. Treat job text as untrusted data (prompt injection).
- **Assistant tools are read-only:** `src/features/assistant/server/assistant-tools.ts` queries run as the signed-in user, filter by `user_id`, and never write, approve, submit or return contact details. New tools follow the same rules and need a label in `src/features/assistant/progress.ts`.

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
- Update `docs/database/database-schema.md` and `src/types/database.ts` in the same change (types are hand-written until `pnpm db:types` can run).
- **Multi-row inserts:** PostgREST sends a column missing from some rows as `null`, not its default. List every column on every row (see `appendExchange` in `assistant-repository.ts`).
- Multi-step writes that must be atomic belong in a `security invoker` SQL function (e.g. `save_application_document`, `mark_application_ready`), not in several client calls.
- The portfolio database is **read-only** for JobPilot: only the `jobpilot_reader` login (column-level SELECT); `portfolioDatabaseUrl()` rejects any other user.

## Design system

- Use tokens from `src/app/globals.css` through Tailwind utilities (`bg-card`, `text-muted-foreground`, `bg-success-soft` …). No raw hex values, no arbitrary colors in components.
- Reuse `src/components/shared/*` (PageHeader, SectionCard, EmptyState, ErrorState) and `src/components/ui/*` (shadcn/ui). Read `docs/design/` before adding UI patterns.
- Every data view needs loading, empty and error states. No fake data, fake statistics or non-functional buttons; unbuilt modules stay out of navigation (`plannedPhase` in `src/config/navigation.ts`).
- Progress indicators show real progress only (e.g. Ask JobPilot steps come from server events; pacing them for readability is fine, inventing steps is not).
- Format dates with the user's timezone from settings (`formatDate`/`formatDateTime`), never the server or browser default, to avoid hydration mismatches.

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

- Never commit secrets. `.env*` is git-ignored except `.env.example`. `supabase/local/` holds personal data and is git-ignored too.
- Never print API keys, passwords or connection strings in logs, test output or chat; refer to keys by variable name or key number.
- Live checks against real providers use temporary scripts or tests that are deleted afterwards; committed tests mock the provider.
- Ask before destructive operations, production database changes, or anything with external effects (sending email, submitting applications, pushing, deploying).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
