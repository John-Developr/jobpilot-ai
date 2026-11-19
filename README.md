# JobPilot AI

A personal, single-user job application assistant. It finds jobs, scores them against your **verified** profile,
helps you prepare tailored application materials, queues the ones you approve by priority and your working hours, and
answers questions about your search. Automated submission inside your working hours arrives in a later phase.

Human approval is always required. JobPilot never invents experience, never bypasses CAPTCHAs or logins, and only
counts an application as submitted when the submission is verified.

> **Status:** Phases 1–6 and the Ask JobPilot assistant are implemented. Phase 7 is in progress: the Trigger.dev
> worker (scheduled discovery, submission scheduler) is written but not deployed, and no site adapter exists yet.
> Analytics and notifications (Phase 8) are planned.
> Details: [docs/development-roadmap.md](docs/development-roadmap.md) · changes: [docs/changelog.md](docs/changelog.md).

## Features

| Area | What it does | Route |
| --- | --- | --- |
| Dashboard | Submission-window status, job pipeline counts, profile readiness | `/dashboard` |
| Settings | Working days and hours (default Mon–Fri 09:00–17:00 Asia/Manila, end exclusive), daily limit, minimum score, scoring weights, **emergency pause** | `/settings` |
| Profile | Personal info, experience, skills, education, certifications, projects, job preferences; optional **read-only sync from your portfolio database** | `/profile/*` |
| Resumes | Resume versions with private file storage and a default resume | `/resumes` |
| Job discovery | Remote OK, Greenhouse, Lever and Ashby connectors plus manual import by URL; canonical URLs and fingerprint de-duplication | `/jobs`, `/jobs/sources` |
| AI evaluation | Per-criterion match scores (skills, experience, responsibilities by AI; remote, salary, type by code), weighted overall score, qualification level, matched/missing skills | `/jobs/[id]` |
| Application Studio | Cover letter, email, resume summary, skills emphasis and recruiter message — generated or written, versioned and restorable; screening answers that start unverified; grounding check that flags unsupported skills and numbers; export to copy, `.md`, `.txt`, print/PDF | `/application-studio` |
| Applications | Approve prepared applications; queue in submission order (priority, window, daily limit) with each row's state; withdraw approval; mark as applied after submitting yourself; failed submissions; activity log of every status change | `/applications` |
| Automation | History of background runs (scheduled discovery every 6 h, submissions); worker in `src/trigger/` — see [background-processing.md](docs/architecture/background-processing.md) | `/automation` |
| Ask JobPilot | Read-only chat docked on the right of every page. Answers from your own data (jobs, scores, applications, activity, AI usage, profile) through fixed tools, streams its steps and answer, saves conversations | every app page |

## Stack

Next.js 16 (App Router, Cache Components, `proxy.ts`) · React 19 · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui ·
Supabase (Postgres, Auth, Storage, RLS) · Zod · React Hook Form · OpenAI SDK against **Gemini** (default) or **OpenAI** ·
Vitest + PGlite migration tests. Planned: Trigger.dev (background jobs), Playwright automation, Sentry.

## Quick start

```bash
pnpm install
cp .env.example .env.local        # see "Environment" below
pnpm dlx supabase@3.2.0 link --project-ref <ref>
pnpm dlx supabase@3.2.0 db push   # applies supabase/migrations (confirm the target project first)
pnpm dev                          # http://localhost:3000  (pnpm dev -p 3001 for another port)
```

No CLI? Run each file in `supabase/migrations/` **in filename order** in the Supabase SQL Editor.

Create your account in the Supabase dashboard (Authentication → Users → Add user). Public sign-up is disabled.
Full guide: [docs/deployment/deployment-guide.md](docs/deployment/deployment-guide.md).

## Environment

All secrets live in `.env.local` (git-ignored). Reference: [docs/deployment/environment-variables.md](docs/deployment/environment-variables.md).

| Variable | Needed for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Everything |
| `GEMINI_API_KEY` (+ optional `GEMINI_API_KEY2`, `GEMINI_API_KEY3`, …) | AI features on Gemini; extra keys are fallbacks used in order |
| `AI_PROVIDER` (`gemini` / `openai`), `OPENAI_API_KEY` | Optional: use OpenAI instead |
| `AI_MODEL` | Optional: comma-separated model fallback list |
| `PORTFOLIO_DATABASE_URL` | Optional portfolio sync; must use the read-only `jobpilot_reader` login |

AI is optional: without a key the app runs and AI buttons explain what is missing.

### AI providers and failover

All model calls go through `src/lib/ai/run-structured.ts` (Chat Completions, so Gemini's OpenAI-compatible endpoint and
OpenAI share one code path). On Gemini, requests try `gemini-2.5-flash` → `gemini-3-flash-preview` →
`gemini-3.5-flash-lite`, each on key 1, 2, 3 … A key or model that hits a quota (429), is rejected, retired for that key
(404) or overloaded (503) is parked and the next pair is used. See [docs/ai/model-strategy.md](docs/ai/model-strategy.md).

> Rotating keys from several free projects to exceed free-tier limits may break Google's API terms. Failover for revoked
> or expired keys is fine; a paid tier is the compliant way to raise limits. The Gemini free tier may also use prompts
> (which include your profile and job data) to improve Google's products.

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | Quality gates; `pnpm check` runs all three |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm db:types` | Regenerate `src/types/database.ts` from the linked project |

`pnpm test` runs unit tests and migration tests: every migration is applied to in-memory Postgres (PGlite) with
Supabase stubs, so schema, RLS and grants are verified without Docker.

## Project layout

```
src/app/             routes: (app) shell, api/assistant/messages, print/
src/features/<name>/ components/, server/ (repositories, actions, services), schemas.ts
src/lib/             ai/ (model calls, key pool), integrations/ (job sources, portfolio), scheduling/, supabase/, monitoring/
src/server/          auth guard, action pipeline, errors
supabase/migrations/ timestamped SQL migrations (never edit an applied one)
tests/               unit/ and integration/db/ (PGlite)
docs/                product, architecture, design, database, API, AI, security, testing, deployment, runbooks
```

## Documentation and contributing

Start at [docs/README.md](docs/README.md). Rules for humans and coding agents: [AGENTS.md](AGENTS.md) (plus
[CLAUDE.md](CLAUDE.md) for Claude Code) and [CONTRIBUTING.md](CONTRIBUTING.md). Never commit `.env.local` or
`supabase/local/` (personal data).
