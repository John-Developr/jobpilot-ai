# Migrations

## Rules

- Files: `supabase/migrations/<YYYYMMDDHHMMSS>_<description>.sql`, applied in name order.
- Never edit a migration after it has been applied anywhere; add a new one.
- Never change the hosted schema in the dashboard SQL editor.
- Destructive changes: expand → migrate data → switch code → contract, as separate migrations, with explicit approval.
- Each migration ships with tests in `tests/integration/db/`.

## Verification

`pnpm test` runs `tests/integration/db/harness.ts`, which loads all migrations into PGlite (Postgres 17 in WASM)
with stubs for `auth.users`, `auth.uid()`, Supabase roles and `storage`. It proves SQL validity, constraints,
triggers, RLS and grants. Supabase-specific runtime features (Vault, realtime, the real Auth service) still need a
Supabase instance.

## Applying to Supabase

```bash
pnpm dlx supabase@3.2.0 login
pnpm dlx supabase@3.2.0 link --project-ref <ref>
pnpm dlx supabase@3.2.0 db push --dry-run   # review
pnpm dlx supabase@3.2.0 db push
pnpm db:types                                # regenerate src/types/database.ts
```

Production pushes require a confirmed backup (see deployment/backup-recovery.md).

## History

| Migration | Summary |
| --- | --- |
| `20261117000001_initial_schema` | Enums, all core tables, indexes, constraints, `updated_at` triggers, new-user bootstrap trigger, RLS policies, column grants, anon revoke |
| `20261117000002_storage` | Private `documents` and `automation` buckets with owner-folder policies |
| `20261117120000_set_default_resume` | `set_default_resume(uuid)` — atomically moves the default resume (security invoker, authenticated only) |
| `20261117230000_assistant_chat` | `assistant_role` enum; `assistant_threads`, `assistant_messages` (append-only for users); `touch_assistant_thread` trigger; prompt `assistant.chat` v1 |
| `20261117210000_application_studio` | `application_documents.source`, `.grounding_flags`, content length check; answer length check; `save_application_document(...)`; `mark_application_ready(uuid, boolean)`; prompts `studio.*` v1 |
| `20261117190000_ai_evaluation` | `job_scores.input_hash`; owner insert policy on `ai_usage_events`; `job_listings` + `overall_score, qualification, evaluated_at`; `record_job_evaluation(...)`; grant update `applications.match_score`; prompt `job.evaluate` v1 |
| `20261117170000_portfolio_sync` | `portfolio_ref` (+ partial unique index) on links, experiences, education, skills, projects; `profiles.portfolio_synced_at`; `apply_portfolio_sync(jsonb)` |
| `20261117150000_job_ingestion` | Unique `(user_id, url)` on jobs; `job_listings` view (security invoker); `ingest_jobs(uuid, jsonb)`; `set_job_archived(uuid, boolean)` |
