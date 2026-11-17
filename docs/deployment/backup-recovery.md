# Backup and recovery

## What to protect

Postgres data (profile, jobs, applications, documents), Storage objects (`documents`, `automation`), and the
schema (already in git as migrations).

## Backups

| Layer | Mechanism |
| --- | --- |
| Database | Supabase daily backups (plan-dependent retention); enable Point-in-Time Recovery if the plan allows |
| Manual snapshot before risky changes | `pnpm dlx supabase@3.2.0 db dump --linked -f backups/<date>-schema.sql` and `--data-only -f backups/<date>-data.sql` (store outside the repo; contains personal data) |
| Storage | Not covered by database backups — periodic download of the `documents` bucket via the dashboard or CLI |
| Code + schema | GitHub |

## Restore

1. Pause automation (Settings → Emergency pause) so nothing writes during recovery.
2. Restore from the Supabase dashboard backup or PITR, or into a fresh project with `psql < data.sql` after `db push`.
3. Re-upload storage objects if needed.
4. Verify: sign in, check counts of jobs/applications, open a document.
5. Resume automation.

## Drill

Run a restore into a scratch project once before production use (Phase 9) and record the result here.
