# ADR-002: Database design

- **Status:** Accepted (2026-11-17)

## Context

Single user today, multi-user possible later. Duplicate submissions and forged "applied" states are the most
damaging failures. Data is written by two kinds of clients: the web app (user JWT) and background workers
(service role).

## Decision

1. Every user-owned table has `user_id` and an RLS owner policy using `(select auth.uid())`.
2. Child tables reference parents through composite FKs `(parent_id, user_id) → parent(id, user_id)`, so a row
   can never point at another user's data even when written by the service role.
3. An application row is the pipeline item for a job: created at discovery (status `discovered`), unique per
   `(user_id, job_id)`. An `archived` status is added to the required list for jobs scoring below 55.
4. Integrity rules live in the database where possible: unique dedupe hash, one application per job, unique
   idempotency key, check constraint "automated + applied ⇒ verified", lock token/timestamp pairing, window
   start < end, salary ranges.
5. Column-level grants: users cannot write `submission_verified_at`, `lock_token`, `locked_at`, `idempotency_key`,
   `attempt_count`, `last_error` on applications or the mirrored `email` on profiles.
6. `application_events` is append-only for users; `automation_runs`, `ai_usage_events`,
   `integration_connections` are read-only for users (workers write them).
7. `prompt_versions` is global (no `user_id`), readable by authenticated users, writable by service role only.
8. A trigger on `auth.users` creates `profiles`, `job_preferences` and `automation_settings` rows.
9. Credentials are never stored in tables; `integration_connections.vault_secret_id` references Supabase Vault.

## Alternatives

- Separate pipeline status on `jobs`: rejected — two status columns for one lifecycle drift apart.
- Single-column FKs + RLS only: rejected — service-role writes would not be protected from cross-user links.
- Enforcing status transitions in a DB trigger: deferred — TypeScript state machine + events first; add a trigger if
  clients other than the app start writing statuses.

## Consequences

- Extra `unique (id, user_id)` indexes on parent tables.
- Users can still set manual statuses (including `applied` with `submission_method = 'manual'`) — intentional for
  applications made outside the app.
