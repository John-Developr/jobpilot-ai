# Background processing

Status: **Planned (Phase 6).** Nothing runs in the background yet.

## Platform

Trigger.dev (v4) — long-running tasks, cron schedules with timezone, retries with backoff, run logs,
concurrency limits and idempotency keys. Vercel functions are unsuitable for multi-minute browser automation.

## Planned tasks

| Task | Trigger | Concurrency | Notes |
| --- | --- | --- | --- |
| `discover-jobs` | cron (per enabled source, e.g. every 6 h) | 1 per source | Writes `jobs`, `automation_runs(kind=discovery)` |
| `evaluate-job` | after ingestion | 3 | Idempotent per (job, profile version, prompt version) |
| `generate-application` | user request or qualification | 2 | Writes documents/answers, status `pending_approval` |
| `schedule-submissions` | cron every 5 min, Mon–Fri 09:00–17:00 Asia/Manila | 1 | Claims eligible applications, enqueues `submit-application` |
| `submit-application` | from scheduler | 1 per user | Playwright; re-checks window + pause before final submit |
| `follow-up-reminders` | cron daily | 1 | Notifications for due follow-ups |

## Rules

- Tasks use a secret-key Supabase client and **always** filter by `user_id`.
- Every run records an `automation_runs` row (status, attempt, step log, error, screenshots).
- Idempotency key = deterministic from inputs (e.g. `submit:<application_id>:<idempotency_key>`), so retries never duplicate side effects.
- Retries only for transient errors (network, 5xx). Validation errors, CAPTCHA, login prompts → `needs_attention`, no retry.
- The cron schedule is a convenience; correctness comes from `evaluateSubmissionWindow` inside the task.
