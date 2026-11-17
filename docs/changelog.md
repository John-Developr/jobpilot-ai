# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added

- **Approval and submission queue (Phase 6).** New Applications page (`/applications`): approve prepared applications,
  see the queue in submission order with each row's state (due now, due at the next window, daily limit reached, paused),
  withdraw an approval, mark an application as applied after submitting it yourself, review failed submissions, and an
  activity log of every status change. Studio shows **Approve** once an application is ready.
- **Application state machine.** One allowed-transition graph enforced by a trigger for every writer. Status and approval
  columns change only through SQL functions (`approve_application`, `withdraw_approval`, `mark_application_submitted`).
  Approval needs verified screening answers and a resume, and is withdrawn automatically when a document, answer or the
  resume changes afterwards.
- **Submission worker contract** for the Phase 7 worker (service role only): `claim_next_application` (per-user lock,
  pause and daily-limit checks, lock token, idempotency key, run row), `release_application_claim`,
  `fail_application_attempt` (retry with backoff only before the final click), `complete_application_submission`
  (requires verification evidence). Stale claims fail instead of retrying, so a crashed run can never submit twice.

- **AI key and model failover.** Several Gemini keys (`GEMINI_API_KEY`, `GEMINI_API_KEY2`, …) are used in order; a key
  that hits its rate/quota limit or is rejected is parked and the next one is used. Models fall back too
  (`gemini-2.5-flash` → `gemini-3-flash-preview` → `gemini-3.5-flash-lite`; `AI_MODEL` accepts a list), covering
  models retired for newer projects (404) and overloaded models (503). Stored evaluations and usage record the model
  that actually answered.
- **Gemini support (default AI provider).** `AI_PROVIDER`, `GEMINI_API_KEY`, `AI_MODEL` (replaces `OPENAI_MODEL`).
  Default model `gemini-2.5-flash`. Verified live: job evaluation and Ask JobPilot tool calls.

### Changed

- Trigger.dev, scheduled discovery and the background scheduler move from Phase 6 to Phase 7, together with the
  Playwright worker that needs them. ADR-003 amended.
- Users can no longer set application statuses directly; existing status-changing functions now run as security definer.

- README rewritten for the current feature set, environment and AI failover; AGENTS.md, Claude agents and skills updated with the module map, AI rules (Chat Completions, failover, Gemini quirks, read-only assistant tools), streaming Route Handler pattern and test patterns.
- **Ask JobPilot redesign.** Modern chat layout (avatar, message bubbles, formatted lists and bold, copy button, tool
  chips, suggestion cards, rounded composer, conversation history with times). Answers stream: the panel shows the real
  steps (Reading your question → Searching jobs, overview… → Reviewing what I found → Writing answer) as the server
  reports them, then the text as it is written.
- Questions go to a streaming Route Handler (`POST /api/assistant/messages`, NDJSON, same-origin check) instead of a
  Server Action.

### Fixed

- Ask JobPilot could not save answers (multi-row insert sent `tools_used` as null). A failed save no longer leaves an
  empty conversation.
- The AI service uses the Chat Completions API instead of the Responses API, so OpenAI and Gemini share one code path.
  Output schemas are sent without bounds to Gemini (Zod still enforces them); omitted tool arguments are read as null.
- **Ask JobPilot** — a read-only AI assistant docked on the right of every app page (full screen on phones).
  Answers questions about your own data through six fixed tools: overview (job and application counts, today vs
  daily limit, submission window, pause), job search, job details with match evaluation and prepared documents,
  recent activity, AI usage, and profile summary. It cannot change anything. It knows which page you are on, so
  "this job" works. Conversations are saved and can be reopened or deleted.
- Migration `20261117230000_assistant_chat`: `assistant_threads`, append-only `assistant_messages` (RLS, no
  update/delete), thread bump trigger, prompt `assistant.chat` v1.
- `runConversation` in the central AI service: function calling with Zod-validated arguments, tool errors returned
  to the model as data, a step limit, and one `ai_usage_events` row per answer.
- **Phase 5 — Application Studio** (`/application-studio`). Per application: cover letter, application email,
  resume summary, skills to emphasize and recruiter message, each generated (optional instructions), edited and
  saved as numbered versions with history and restore; screening questions with AI drafts that start unverified and
  must be confirmed; resume version per application; copy, .md/.txt download and print/save as PDF.
- Grounding check on every saved version (AI or manual): flags job skills you don't have and numbers not found in
  your profile or the job. "Mark ready for approval" is blocked until flags are fixed or explicitly confirmed.
- Contact details and sign-off are appended by the app; they are never sent to the AI.
- "Open in Studio" on job pages; Application Studio enabled in navigation.
- Migration `20261117210000_application_studio`: `source` and `grounding_flags` on documents, length limits,
  `save_application_document` (atomic versioning, moves to drafting), `mark_application_ready`, six studio prompts v1.

### Changed

- Evaluation and Studio share `loadCandidateContext` (one place that loads verified profile facts for AI).
- **Phase 4 — AI job evaluation.** "Score match" on a job and "Score N unscored" on the Jobs page (one request
  per job from the browser, stoppable). One OpenAI structured-output call per job extracts requirements and scores
  technical skills, experience and responsibilities with reasoning; remote, salary and employment type are computed
  in code from your preferences; the weighted total and qualification (85/70/55) are computed in code.
- Match card on the job page: score, qualification, per-criterion bars with weights and reasoning, matched/missing
  skills, factors, extracted requirements, model and prompt version.
- Grounding: AI "matched skills" not present in your verified profile are dropped.
- Caching by input hash (prompt, model, profile facts, job, preferences, weights): unchanged jobs are not re-scored.
- Jobs list: score badges, Match filter (by level or "Not scored") and "Best match" sort. Dashboard: Qualified and
  Not scored tiles. Settings: editable scoring weights.
- Central AI service (`src/lib/ai/run-structured.ts`): active prompt from `prompt_versions`, Zod re-validation,
  every call logged to `ai_usage_events` (tokens, latency, success).
- Migration `20261117190000_ai_evaluation`: `job_scores.input_hash`, owner insert on `ai_usage_events`,
  `job_listings` score columns, `record_job_evaluation` (atomic score + requirements + status + event),
  prompt `job.evaluate` v1.
- **Portfolio sync.** "Sync from portfolio" on Profile copies your portfolio's profile, links, experience,
  education, skills and published projects through a read-only database login (`jobpilot_reader`). Portfolio
  values win for the fields it has; JobPilot-only details (achievements, technologies, proficiency, primary skills)
  are kept; matching resume-imported items are linked, not duplicated. Synced items show a Portfolio badge and can
  only be removed in the portfolio. Requires portfolio migration `20261121000100_jobpilot_reader.sql`, JobPilot
  migration `20261117170000_portfolio_sync.sql` and `PORTFOLIO_DATABASE_URL`. See ADR-005.
- **Phase 3 — Job discovery.** Jobs page (`/jobs`) with URL-based filters (title/company, location, minimum
  salary, work arrangement, employment type, source, active/archived) and pagination; job detail page with
  description, facts, archive/restore and delete.
- Source connectors with independent adapters: Remote OK (public API, keyword-filtered, attribution link),
  Greenhouse, Lever and Ashby company boards (public job-board APIs, optional title keywords). "Sync now" per source
  with a 10-minute cooldown, per-company warnings, last-sync status and job counts (`/jobs/sources`).
- Manual job entry with "Fill from page" (schema.org JobPosting extraction). LinkedIn, Indeed, JobStreet, SEEK and
  Glassdoor pages are never fetched.
- Normalization (HTML to text, canonical URLs, employment/remote detection, plausible-salary checks) and duplicate
  detection by fingerprint, canonical URL and source id.
- Migration `20261117150000_job_ingestion`: `job_listings` view, `ingest_jobs` (atomic jobs + pipeline rows),
  `set_job_archived` (with audit events), unique canonical URL per user.
- Dashboard pipeline card with real counts (active, found this week, archived).
- **Phase 2 — Profile and resumes.** Profile area (`/profile`) with tabs for personal information and links,
  experience, skills (single and bulk add), education and certifications, projects, and job preferences
  (titles, locations, employment types, work arrangements, salary range, relocation). Full create/edit/delete
  with validation and confirmation dialogs.
- Resume versions (`/resumes`): create, edit, delete, make default (atomic `set_default_resume` function), and
  PDF/DOCX upload up to 10 MB directly from the browser to the private `documents` bucket via signed upload URLs;
  the server verifies type and size from storage metadata. Downloads use 60-second signed URLs (`/resumes/:id/file`).
- Dashboard "Profile readiness" checklist computed from real profile rows.
- Shared form toolkit: `useActionForm` hook, typed field components, `FormDialog`, `DeleteButton`, `ListTextarea`.
- `runAction` server helper (auth → validate → run → log → refresh) and `assertMutation` result checks.
- Next.js 16 project (App Router, Cache Components, TypeScript strict, Tailwind CSS 4, shadcn/ui on Radix).
- Design system derived from the portfolio: color tokens (light/dark), Karla typography, radius, elevation,
  motion and skeleton tokens in `src/app/globals.css`; shared `PageHeader`, `SectionCard`, `EmptyState`, `ErrorState`.
- Application shell with sidebar navigation, mobile navigation sheet, theme switcher and user menu.
  Unbuilt modules appear as non-interactive "Soon" entries.
- Supabase integration: SSR clients, proxy-based session refresh with auth redirect, `requireUser` data-access guard.
- Email/password sign-in and sign-out with safe post-login redirects.
- Database migrations for profiles, professional data, resumes, job sources, jobs, requirements, scores,
  applications, documents, answers, events, automation settings/runs, integrations, AI usage, notifications and
  prompt versions; private `documents` and `automation` storage buckets.
- Submission-window engine (`src/lib/scheduling/submission-window.ts`) with timezone, working days, exclusive end
  time, emergency pause and next-window calculation.
- Settings page for submission schedule, daily limit, minimum match score, retries and emergency pause.
- Dashboard with live submission-window status computed from server time.
- Structured JSON logger.
- Vitest unit tests and PGlite-based migration tests (schema, RLS, grants, storage policies).
- GitHub Actions CI: lint, typecheck, tests, build.
- Documentation baseline, ADRs, `AGENTS.md`, `CLAUDE.md`, specialist agents, skills and commands.

### Changed

- Settings actions now use the shared `runAction` pipeline.
- Navigation: "Profile" and "Resumes" are live; the combined "Profile & Resumes" placeholder was removed.

### Security

- Portfolio access uses a dedicated Postgres role with column-level SELECT on five tables, forced read-only
  sessions and statement timeouts; the portfolio service-role key is never used.
- "Fill from page" fetches are SSRF-guarded: https only, no IP literals/internal hosts, all resolved addresses must
  be public, redirects re-validated, 2 MB / 10 s caps.
- Job search terms are reduced to a safe character set before reaching PostgREST filters.
- Resume uploads are confined to `<user_id>/resumes/<resume_id>/` and re-validated server-side before attaching.
- Row Level Security on every table; composite foreign keys prevent cross-user references.
- Column-level grants stop clients from setting submission verification, locks or idempotency keys.
- Database check constraint: an automated submission cannot be `applied` without verification.
- Public sign-up disabled; anon role has no table access; security headers (frame denial, nosniff, referrer policy).
