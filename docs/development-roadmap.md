# Development roadmap

Last updated: 2026-11-17. Each phase ends with `pnpm check && pnpm build` green, docs and changelog updated.

## Phase 0 — Audit and planning ✅

Repository audit (greenfield), portfolio design analysis, architecture, schema, documentation baseline,
agent instruction system.

## Phase 1 — Foundation ✅ (pending live Supabase verification)

| Item | Status |
| --- | --- |
| Next.js 16 + TypeScript strict + Tailwind 4 + shadcn/ui scaffold | Done |
| Design tokens from portfolio (light/dark), Karla, shared components | Done |
| App shell: sidebar, mobile sheet nav, theme toggle, user menu | Done |
| Supabase SSR clients, proxy session refresh, `requireUser` DAL | Done |
| Email/password sign-in, sign-out (sign-up disabled) | Done |
| Migrations: full schema, RLS, grants, storage buckets | Done — verified on PGlite |
| Submission-window engine + boundary tests | Done |
| Settings: submission schedule, limits, retries, emergency pause | Done |
| Dashboard: live submission-window status | Done |
| CI workflow (lint, typecheck, test, build) | Done |
| Run against a real Supabase project; e2e smoke test | **Blocked** — needs project credentials |

## Phase 2 — Profile and resumes ✅ (pending live verification of uploads)

| Item | Status |
| --- | --- |
| Personal information, links | Done |
| Experience, skills (incl. bulk add), education, certifications, projects | Done |
| Job preferences | Done |
| Resume versions, default resume (`set_default_resume` migration) | Done — migration must be applied to Supabase |
| Resume file upload/download (signed URLs, server-side verification) | Done — not yet exercised against live storage |
| Dashboard profile readiness | Done |
| E2E tests against Supabase | Not started (needs a test project / credentials) |

## Phase 3 — Job discovery ✅ (pending migration on Supabase)

| Item | Status |
| --- | --- |
| Connector framework, Remote OK, Greenhouse, Lever, Ashby | Done — parsers tested on real payloads; live smoke run 2026-11-17 |
| Normalization, dedupe (fingerprint + canonical URL + source id) | Done |
| Manual entry + "Fill from page" (JSON-LD, SSRF-guarded) | Done |
| Jobs list (filters, pagination), detail, archive/restore, delete | Done |
| Sources page (config, enable, Sync now, status) | Done |
| Dashboard pipeline counts | Done |
| Scheduled discovery | Deferred to Phase 6 (Trigger.dev) |
| Generic career-page polling (any URL) | Deferred — manual "Fill from page" covers one-off pages |

Original scope: Connector registry with independent adapters; Remote OK (public API, attribution required); company career
boards via public ATS APIs (Greenhouse, Lever, Ashby) and schema.org `JobPosting`; manual entry/import by URL or
pasted text (the supported path for LinkedIn, Indeed, JobStreet); normalization; dedupe hashing; jobs list
with filters (title, location, salary, employment type, remote) and pagination.

## Portfolio sync ✅ (pending setup)

Read-only sync from the portfolio database (ADR-005). Verified: reader role against all 20 portfolio migrations
(PGlite), sync SQL (PGlite), mapping (unit tests). Not yet verified: a live connection — needs the portfolio
migration applied, the login enabled and `PORTFOLIO_DATABASE_URL` set.

## Phase 4 — AI evaluation ✅ (pending OPENAI_API_KEY and migrations)

| Item | Status |
| --- | --- |
| Central AI service, prompt versioning, structured outputs, usage logging | Done |
| Requirement extraction + 3 AI criteria; 3 deterministic criteria; weighted score; qualification | Done — scoring math unit-tested |
| Grounding of matched skills; output validation | Done — unit-tested |
| Status rules (qualified / manual review / archived), audit event | Done — DB-tested |
| Match card, batch scoring, filters/sort, dashboard tiles, weights settings | Done |
| Live call to OpenAI | **Not verified** — needs `OPENAI_API_KEY`; default model `gpt-5-mini` (override with `OPENAI_MODEL`) |
| Cost in USD | Not computed — prices are not hard-coded; tokens are recorded |

Original scope: Central AI service (OpenAI structured outputs, prompt versions, usage tracking); requirement extraction;
per-criterion scoring with configurable weights; qualification levels; explanation UI; re-evaluation caching.

## Phase 5 — Application Studio ✅ (pending OPENAI_API_KEY and migrations)

| Item | Status |
| --- | --- |
| Six sections generated/edited independently, versioned, restorable | Done — versioning DB-tested |
| Screening answers with verification | Done |
| Grounding check (skills + numbers) on every version; ready-for-approval gate | Done — unit + DB tested |
| Export: copy, .md, .txt, print/PDF | Done |
| DOCX export | Not done — use .md/.txt or PDF; add if an ATS requires .docx |
| Live AI generation | **Not verified** — needs `OPENAI_API_KEY` |

Original scope: Tailored cover letters, application emails, resume summary, skills emphasis, screening answers, recruiter
messages; section-level regeneration; versioning; edit/preview; export (PDF/DOCX/Markdown); grounding check
against verified profile.

## Ask JobPilot (assistant) ✅ (pending OPENAI_API_KEY and migration)

| Item | Status |
| --- | --- |
| Right-side chat panel on every app page; saved conversations | Done |
| Read-only tools over jobs, scores, applications, activity, AI usage, settings, profile | Done — loop unit-tested with a mocked model |
| Tables, RLS, append-only messages | Done — DB-tested |
| Live answers | Verified with Gemini `gemini-2.5-flash` (tool calls against stubbed data); not yet in the browser against your data |

Limits: answers are not streamed (the reply appears when complete, usually a few seconds); no actions by design;
the model only sees the last 20 messages of a conversation.

## Phase 6 — Queue, approval and scheduling

Trigger.dev setup; application state machine and events; approval workflow; scheduler that respects the
submission window; daily limit; claim function with lock + idempotency key; safe retry with backoff;
execution history.

## Phase 7 — Browser automation

Playwright worker in isolated contexts; supported-flow adapters (start with public ATS forms that permit it);
field mapping from verified data; uploads; screenshots; human-intervention stops (CAPTCHA, login, unknown or
sensitive fields, blocked automation, layout change); final submit only after approval + window re-check;
submission verification.

## Phase 8 — Tracking, analytics, notifications, monitoring

Application tracker (table + kanban), interviews/follow-ups, analytics with date filters from real records,
in-app notifications (optional email provider), Sentry, AI cost dashboard.

## Phase 9 — Hardening and release

Security review (RLS audit, secrets, CSP), performance pass, backup drill, deployment to Vercel production,
documentation review.

## Known limitations

- No Supabase project linked yet: the app has only been verified on the login page, build and PGlite tests.
  Dashboard and Settings have not run against a live database.
- `src/types/database.ts` is hand-written for the tables in use; regenerate with `pnpm db:types` once linked.
- LinkedIn, Indeed and JobStreet offer no permitted public API for job seekers. They will be supported through
  manual import only; automated discovery/submission on those sites is out of scope.
- Many ATS application forms use CAPTCHA; those flows will always require manual completion.
- Discovery runs inside the request ("Sync now"); a slow source can take ~15 s. Moves to background tasks in Phase 6.
- Lever and Ashby APIs do not return a company name; it is derived from the board name (e.g. "acme-corp" becomes "Acme Corp").
- Salary filters compare raw numbers; currencies and periods are not converted.
- Salary scoring only compares the same currency (no FX conversion); different currencies score a neutral 50.
- Scoring runs in the request (about 5–30 s per job); batches run one job per request from the browser.
- Grounding is heuristic: it checks job-listed skills and numbers, not every sentence. You still review each document.
- Settings changes and emergency pause are logged to server logs but not yet to a user-visible audit trail.

## Technical debt

| Item | Plan |
| --- | --- |
| Hand-written DB types | Replace with generated types once the Supabase CLI is logged in and linked |
| Automation run records for syncs | Syncs record status on `job_sources`; `automation_runs` rows come with workers (Phase 6) |
| Portfolio project dates | Portfolio stores a free-text period; JobPilot project dates stay manual |
| Profile item ordering | Lists sort by date; manual ordering (`sort_order`) has no UI yet |
| No e2e tests | Add Playwright smoke tests against a Supabase test project (carried over to Phase 3) |
| No password reset flow | Owner resets via Supabase dashboard; add flow if needed |
| Settings audit trail | Add `settings_events` or generalize events table (Phase 6) |
