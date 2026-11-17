---
description: Create a new Supabase migration with RLS and a migration test
argument-hint: <short description of the schema change>
---

Create a migration for: $ARGUMENTS

Follow the `database-management` skill.

1. Read the latest files in `supabase/migrations/` and `docs/database/database-schema.md`.
2. Create `supabase/migrations/<UTC YYYYMMDDHHMMSS>_<snake_description>.sql`. Never edit an existing migration.
3. Include RLS, policies, indexes, constraints and `updated_at` trigger as applicable.
4. Add tests to `tests/integration/db/` for every new constraint, policy and grant. Run `pnpm test`.
5. Update `src/types/database.ts` and `docs/database/database-schema.md` (+ `migrations.md` history).
6. If the change is destructive, stop and ask the user before writing the contract step.
Do not push the migration to any hosted database.
