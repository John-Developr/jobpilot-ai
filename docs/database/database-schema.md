# Database schema

Source of truth: `supabase/migrations/`. Postgres 17 (Supabase). All tables in `public`.
Every table has `created_at timestamptz default now()`; mutable tables also have `updated_at` maintained by
the `set_updated_at` trigger. Primary keys are `uuid default gen_random_uuid()` unless noted.

## Enums

`employment_type` (full_time, part_time, contract, freelance, internship, temporary, other) ·
`remote_type` (remote, hybrid, onsite, unknown) · `salary_period` (hour, day, month, year) ·
`skill_category` · `source_kind` (api, feed, career_page, manual) · `requirement_kind` ·
`qualification_level` (high_priority, recommended, manual_review, archive) ·
`application_status` (discovered, analyzing, qualified, drafting, pending_approval, approved, scheduled, applying,
applied, failed, interview, assessment, rejected, withdrawn, archived) · `submission_method` (automation, manual) ·
`document_kind` · `answer_source` (profile, ai, user) · `run_kind` · `run_status` (queued, running, succeeded,
failed, needs_attention, cancelled) · `event_actor` (user, system, automation) · `notification_type` ·
`connection_status`.

## Profile and professional data

| Table | Key columns | Constraints / indexes | RLS |
| --- | --- | --- | --- |
| `profiles` | `id` = `auth.users.id`, full_name, headline, email (citext, mirrored), phone, location, summary, years_of_experience | — | owner select/update; update limited to editable columns |
| `profile_links` | label, url, sort_order | url must be http(s); idx (user_id, sort_order) | owner all |
| `job_preferences` | PK user_id; desired_titles[], preferred_locations[], employment_types[], accepted_remote_types[], salary_min/max/currency/period, willing_to_relocate | min ≤ max | owner all |
| `professional_experiences` | company, title, location, employment_type, remote_type, start/end_date, is_current, description, achievements[], technologies[] | end ≥ start; not (current and end); idx (user_id, start_date desc) | owner all |
| `professional_skills` | name (citext), category, proficiency 1–5, years, is_primary | unique (user_id, name) | owner all |
| `education` | institution, degree, field_of_study, dates | end ≥ start | owner all |
| `certifications` | name, issuer, issued_on, expires_on, credential_url | expires ≥ issued | owner all |
| `projects` | name, role, description, url, repository_url, technologies[], highlights[], dates | http(s) urls | owner all |
| `resumes` | name, target_category, summary, emphasized_skills[], storage_path, mime_type, file_size_bytes, is_default | one default per user (partial unique); unique (id, user_id) | owner all |

## Discovery and evaluation

| Table | Key columns | Constraints / indexes | RLS |
| --- | --- | --- | --- |
| `job_sources` | connector_key, name, kind, is_enabled, config jsonb (non-secret), last_synced_at, last_error | unique (user_id, connector_key) | owner all |
| `jobs` | source_id, external_id, url, dedupe_hash, title, company, location, remote_type, employment_type, salary_*, description, posted_at, discovered_at | unique (user_id, dedupe_hash); unique (user_id, url) (canonical URL); unique (user_id, source_id, external_id) where external_id not null; idx (user_id, discovered_at desc); FK (source_id, user_id) on delete set null | owner all |
| `job_requirements` | job_id, kind, description, is_required, min_years | FK (job_id, user_id) cascade | owner all |
| `prompt_versions` | prompt_key, version, template, output_schema, default_model, is_active | unique (prompt_key, version); one active per key | authenticated select only |
| `job_scores` | overall_score 0–100, qualification, criteria_scores, criteria_weights, matched/missing_skills[], experience_gaps[], positive/negative_factors[], explanation, model, prompt_version_id, evaluated_at | idx (job_id, evaluated_at desc), (user_id, overall_score desc) | owner all |

## Applications

| Table | Key columns | Constraints / indexes | RLS |
| --- | --- | --- | --- |
| `applications` | job_id, status, priority 0–100, resume_id, match_score, approved_at, scheduled_for, submitted_at, submission_method, submission_verified_at, idempotency_key, lock_token, locked_at, attempt_count, last_error, recruiter_*, next_interview_at, follow_up_at, notes | unique (user_id, job_id); unique idempotency_key; check automated `applied` ⇒ verified; lock pair check; lock ⇔ `applying` (`applications_claim_matches_status`); approved/scheduled/applying ⇒ `approved_at` (`applications_approval_recorded`); status transitions guarded by trigger; partial idx for scheduled, submitted, follow-ups | owner all; **column grants** (users cannot write status, approved_at, scheduled_for, submitted_at, submission_method, verification, lock, idempotency, attempts, last_error — those change only through the functions below) |
| `application_documents` | kind, version, title, content, storage_path, is_approved, model, prompt_version_id | unique (application_id, kind, version) | owner all |
| `application_answers` | question, answer, source, is_verified, model, prompt_version_id | — | owner all |
| `application_events` | event_type, from_status, to_status, actor, message, metadata | idx (application_id, created_at desc), (user_id, created_at desc) | owner select; insert only with actor = 'user' (append-only) |

## Automation and system

| Table | Key columns | Constraints | RLS |
| --- | --- | --- | --- |
| `automation_settings` | PK user_id; is_enabled (default false), is_paused, paused_at, paused_reason, timezone (Asia/Manila), working_days smallint[] ({1..5}), window_start 09:00, window_end 17:00, daily_application_limit 10, min_match_score 70, require_approval true, max_retries 3, retry_backoff_minutes 30, scoring_weights, notification_preferences | start < end; days ⊆ 1..7; paused ⇒ paused_at | owner all |
| `automation_runs` | kind, status, application_id, job_source_id, external_run_id, idempotency_key, attempt, started/finished_at, error_code/message, log jsonb, screenshot_paths[] | unique (user_id, idempotency_key) | owner select (workers write) |
| `integration_connections` | provider, status, account_label, vault_secret_id, last_verified_at, metadata | unique (user_id, provider) | owner select (workers write) |
| `ai_usage_events` | operation, model, prompt_version_id, input/output/cached tokens, estimated_cost_usd, latency_ms, succeeded, error_code | idx (user_id, created_at desc) | owner select (workers write) |
| `assistant_threads` | title (1–120), updated_at (bumped by each new message) | unique (id, user_id); idx (user_id, updated_at desc) | owner all; update only title, updated_at |
| `assistant_messages` | thread_id, role (`assistant_role`), content (1–20,000), tools_used text[] | FK (thread_id, user_id) cascade; idx (thread_id, created_at) | owner select, insert; no update or delete (removed with the thread) |
| `notifications` | type, title, body, link_path, dedupe_key, read_at | unique (user_id, dedupe_key); partial idx unread | owner all |

## Storage

Private buckets `documents` (10 MB; PDF, DOCX, TXT, MD) and `automation` (5 MB; PNG, JPEG).
Object paths start with `<user_id>/`. Owner has full access to `documents/<uid>/…`, read-only to `automation/<uid>/…`.

## Triggers and functions

- `set_updated_at()` on all mutable tables.
- `handle_new_user()` (security definer) on `auth.users` insert → `profiles`, `job_preferences`, `automation_settings`.
- `touch_assistant_thread()` trigger (security invoker) — after a message insert, sets the thread's `updated_at`.
- `save_application_document(p_application_id, p_kind, p_title, p_content, p_source, p_model, p_prompt_version_id, p_grounding_flags)` (security definer since Phase 6) — locks the application, appends version max+1 of that kind, moves discovered/qualified to drafting with an event. Returns the version.
- `mark_application_ready(p_application_id, p_confirm_flags)` (security definer since Phase 6) — discovered/qualified/drafting → pending_approval; needs a cover letter or email; refuses while the latest version of any kind has grounding flags unless confirmed; writes an event.
- `record_job_evaluation(p_job_id, p_score jsonb, p_requirements jsonb, p_next_status)` (security definer since Phase 6) — inserts a `job_scores` row, replaces `job_requirements`, sets `applications.match_score` (and priority when qualified), changes status only from discovered/analyzing/qualified, and writes a `job.evaluated` event.
- `apply_portfolio_sync(p_snapshot jsonb)` (security invoker) — applies a portfolio snapshot atomically: links chosen local rows, upserts by `portfolio_ref` (portfolio value wins when non-null), unlinks rows removed from the portfolio. Skills: inserts new ones only. Returns per-section counts. Columns `portfolio_ref` exist on `profile_links`, `professional_experiences`, `education`, `professional_skills`, `projects`; `profiles.portfolio_synced_at` records the last sync.
- `ingest_jobs(p_source_id uuid, p_jobs jsonb)` (security invoker) — inserts jobs and a `discovered` application per new job in one statement; any unique conflict (dedupe hash, `(user_id, url)`, `(user_id, source_id, external_id)`) is skipped. Returns `inserted_count`, `skipped_count`.
- `set_job_archived(p_job_id uuid, p_archived boolean)` (security definer since Phase 6) — archives (only before approval) or restores the job's application and writes an `application_events` row. Idempotent.
- View `job_listings` (security invoker): jobs + application status + source key/name + `salary_upper = coalesce(salary_max, salary_min)`; used by lists, filters and counts.
- `set_default_resume(p_resume_id uuid)` (security invoker) — clears the current default and sets the given resume; raises `P0002` if the resume is not the caller's. Executable by `authenticated` only.

### Application state machine and queue (Phase 6, `20261118000000_application_queue.sql`)

Functions that change statuses run as **security definer**, check `auth.uid()` and filter by `user_id`, because
users no longer hold UPDATE on status columns.

- `application_transition_allowed(from, to)` (immutable) — the one allowed-transition graph. Trigger
  `guard_status_transition` (before update, any writer including the service role) raises `22023` for other moves.
- Approval follows content: triggers `approval_content_changed` (after insert/update/delete on `application_documents`
  and `application_answers`) and `approval_resume_changed` (before update of `resume_id`) return an approved,
  scheduled or failed application to `pending_approval` with an `application.approval_withdrawn` event, and refuse
  changes while it is `applying`.
- `approve_application(p_application_id, p_submit_after)` — pending_approval | failed → `approved` (`p_submit_after`
  null or past) or `scheduled` (`scheduled_for = p_submit_after`). Needs a cover letter or email, every screening
  answer verified, and a resume (chosen or default; pinned on the row). Resets attempts. Idempotent.
- `withdraw_approval(p_application_id)` — approved | scheduled | failed → pending_approval.
- `mark_application_submitted(p_application_id)` — manual submission from any pre-submission status → `applied`,
  `submission_method = 'manual'`, `submitted_at = now()`.
- **Worker contract (service role only; Phase 7 worker):** `claim_next_application(p_user_id, p_day_start, p_day_end)`
  (per-user advisory lock; fails stale claims older than 60 min without retry; nothing when automation is off/paused or
  the daily limit — every submission of the local day plus claims in flight — is used; picks approved/scheduled due
  rows by priority desc, created_at with `for update skip locked`; writes an `automation_runs` row with idempotency key
  `submit:<application idempotency_key>:<lock_token>`), `release_application_claim` (no attempt counted),
  `fail_application_attempt` (retryable only before the final click: back to `scheduled` after
  `retry_backoff_minutes` while attempts ≤ `max_retries`, else `failed` + run `needs_attention`),
  `complete_application_submission` (requires non-empty evidence; sets `submission_verified_at`).

## Migration history

See [migrations.md](migrations.md).
