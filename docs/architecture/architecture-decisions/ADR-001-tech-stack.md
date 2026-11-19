# ADR-001: Technology stack

- **Status:** Accepted (2026-11-17)

## Context

Greenfield repository. Single-user productivity app with AI analysis, background jobs and browser automation.
The owner's portfolio already uses Next.js, Supabase and Vercel; maintainability by one developer matters more
than theoretical scale.

## Decision

- **Web:** Next.js 16 App Router with Cache Components, React 19, TypeScript strict, Tailwind CSS 4,
  shadcn/ui (Radix base), Lucide icons, React Hook Form + Zod.
- **Data/Auth/Files:** Supabase (Postgres 17, Auth, Storage, RLS).
- **AI:** OpenAI API with structured outputs behind a central service (Phase 4).
- **Background:** Trigger.dev (Phase 7, see ADR-003 amendment). **Automation:** Playwright, run in workers only (Phase 7).
- **Hosting:** Vercel (web), Supabase cloud, Trigger.dev cloud. **CI:** GitHub Actions.
- **Tests:** Vitest; PGlite for migration/RLS tests; Playwright for e2e.
- **Package manager:** pnpm.

## Alternatives

- Separate API server (NestJS/Express): rejected — Server Actions + Route Handlers cover the needs without a second deployable.
- Prisma/Drizzle ORM: rejected for now — RLS-first access with the user's JWT is simplest via supabase-js; SQL migrations stay the single schema source.
- Inngest / Vercel Cron / pg_cron for jobs: Trigger.dev chosen for long-running Playwright tasks, retries and run logs.
- Supabase local stack for DB tests: requires Docker; PGlite gives fast, dependency-free verification of the same SQL.

## Consequences

- Cache Components requires session-dependent UI inside Suspense boundaries.
- Hand-maintained DB types until a project is linked.
- Playwright cannot run on Vercel; automation is tied to Trigger.dev workers.
