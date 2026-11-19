# Background processing

Status: **Implemented in code (Phase 7, slice 1), not yet deployed.** Tasks live in `src/trigger/`, logic in
`src/features/automation/server/`. Nothing runs until a Trigger.dev project is set up (below). No site adapter exists
yet, so the scheduler never claims an application; discovery runs as soon as the worker is deployed.

## Platform

Trigger.dev (v4) — long-running tasks, cron schedules with timezone, retries with backoff, run logs,
concurrency limits and idempotency keys. Vercel functions are unsuitable for multi-minute browser automation.

## Tasks

| Task | Trigger | Concurrency | Status | Notes |
| --- | --- | --- | --- | --- |
| `discover-jobs` | cron `0 */6 * * *` (UTC) | default | Implemented | Per user, per enabled automated source: same steps as "Sync now"; one `automation_runs(kind=discovery)` row per source and tick (`discover:<source_id>:<scheduled time>`); one failing source never stops the others |
| `schedule-submissions` | cron `*/10 * * * *` | default | Implemented | Per user with automation on: inside the window, due applications whose site has an adapter are offered to `claim_next_application`; outside it the claim runs with no candidates (clears stale claims). Starts `submit-application`; releases the claim if that fails |
| `submit-application` | from the scheduler | 1 (queue) | Implemented, no adapters | Max 15 min (well under the 60-min stale-claim limit). Re-reads settings at start and again in `confirmFinalSubmit` right before the final click; outcome → complete / release / fail |
| `evaluate-job` | after ingestion | 3 | Planned | Idempotent per (job, profile version, prompt version); needs a worker path for `record_job_evaluation` |
| `generate-application` | user request or qualification | 2 | Planned | Writes documents/answers |
| `follow-up-reminders` | cron daily | 1 | Planned (Phase 8) | Notifications for due follow-ups |

## Submission outcomes

| Adapter outcome | Database call | Retry |
| --- | --- | --- |
| `submitted` (confirmation verified) | `complete_application_submission` with evidence | — |
| `dry_run_complete` | `fail_application_attempt(code dry_run)` → Needs attention | Never |
| `not_confirmed` (window closed or paused at the final check) | `release_application_claim` (next window start) | Not an attempt |
| `stopped` (CAPTCHA, login, unknown/sensitive field, layout change) | `fail_application_attempt` | Never |
| exception before `markFinalClick()` | `fail_application_attempt(worker_error)` | Yes, with backoff |
| exception after `markFinalClick()`, or recording failed | `fail_application_attempt(error_after_submit)`; `automation.submission.unrecorded` log | Never |

Adapters (`src/features/automation/adapters.ts`) are registered in code with a fixed `dryRun` flag; none exist yet.

## Setup (once)

1. Create a Trigger.dev project. Put its ref in `.env.local` as `TRIGGER_PROJECT_REF` and the dev secret key as
   `TRIGGER_SECRET_KEY`; add `SUPABASE_SECRET_KEY` (Supabase → Project Settings → API keys → secret key).
2. In the Trigger.dev dashboard, set for each environment: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (and the AI keys once AI tasks exist).
3. `pnpm dlx trigger.dev@4.8.5 login`, then `pnpm trigger:dev` to run tasks locally, or `pnpm trigger:deploy`.
   If pnpm blocks the esbuild install script, run `pnpm approve-builds` first.

## Rules

- Tasks use a secret-key Supabase client and **always** filter by `user_id`.
- Every run records an `automation_runs` row (status, attempt, step log, error, screenshots).
- Idempotency key = deterministic from inputs (`submit:<application idempotency_key>:<lock_token>` for submissions, set by the claim), so task retries never duplicate side effects.
- Submission retries only through `fail_application_attempt(retryable => true)`, and only when the run stopped before the final click.
- Retries only for transient errors (network, 5xx). Validation errors, CAPTCHA, login prompts → `needs_attention`, no retry.
- The cron schedule is a convenience; correctness comes from `evaluateSubmissionWindow` inside the task.
