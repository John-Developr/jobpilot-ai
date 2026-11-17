# ADR-005: Portfolio as the source of profile data (read-only sync)

- **Status:** Accepted (2026-11-17)

## Context

The owner maintains their profile, experience timeline, skills and projects in their portfolio CMS
(separate Next.js app and Supabase project, repo `me`). Re-entering the same data in JobPilot duplicates effort.
The portfolio content tables are admin-only (RLS); the public site reads them with the service role.
JobPilot needs stable, verified facts for scoring and generation, plus details the portfolio lacks
(achievement bullets, per-role technologies, skill proficiency, job preferences).

## Decision

1. **Direct, read-only database access** through a dedicated Postgres role `jobpilot_reader` in the portfolio
   database (migration `20261121000100_jobpilot_reader.sql` in the portfolio repo): column-level `SELECT` on
   `profiles`, `projects` (published only), `experiences`, `skills`, `skill_categories`; forced read-only sessions;
   no access to messages, analytics, admin users, media, settings, birthdate, civil status, avatar or email.
2. JobPilot connects with `PORTFOLIO_DATABASE_URL` (server-only, via the Supabase pooler) using the `postgres`
   driver, inside a `READ ONLY` transaction.
3. **Copy, don't read live.** "Sync from portfolio" copies into JobPilot's own tables via `apply_portfolio_sync`,
   so scores and documents keep a stable basis.
4. **Merge rules:** portfolio values win for fields it has (nullable portfolio fields never erase local values);
   JobPilot-only fields are never touched; existing local rows that match (company + start month ±1, similar
   institution, skill name ignoring case/".js", link URL, project name) are linked instead of duplicated; rows
   removed from the portfolio are unlinked, never deleted. Synced rows cannot be deleted in JobPilot.
5. Certifications, job preferences, resumes and years of experience stay JobPilot-only (the portfolio has none).

## Alternatives

- **Service-role key in JobPilot:** rejected — full read/write over every portfolio table and storage.
- **Export API route in the portfolio:** decoupled from the schema but needs portfolio code and redeploys; kept as
  the fallback if schema coupling becomes painful.
- **Live reads without copying:** rejected — history of scores would silently change; extra latency on every page.

## Consequences

- JobPilot is coupled to the portfolio column names in `src/lib/integrations/portfolio/reader.ts`; rows are
  Zod-validated, so a schema change fails the sync with a clear message rather than importing bad data.
- One new dependency: `postgres` (server-only).
- Revoking access is one statement in the portfolio database: `alter role jobpilot_reader nologin;`.
