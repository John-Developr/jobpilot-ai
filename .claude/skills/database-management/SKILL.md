---
name: database-management
description: How to change the JobPilot AI Supabase schema safely — migration naming, RLS/grant patterns, composite FKs, indexes, PGlite migration tests and type regeneration. Load before touching supabase/ or src/types/database.ts.
---

# Database management

## Create a migration

1. New file: `supabase/migrations/<YYYYMMDDHHMMSS>_<snake_description>.sql` (UTC timestamp, later than all existing).
2. Write forward-only SQL. For destructive changes: expand (add new) → backfill → switch code → contract (drop old) in a later migration, with user approval.
3. Add tests in `tests/integration/db/*.test.ts` using `createMigratedDatabase`, `createUser`, `asUser`.
4. `pnpm test`.
5. Update `src/types/database.ts` (or `pnpm db:types` once linked) and `docs/database/database-schema.md`.
6. Apply to the hosted project only with explicit approval: `pnpm dlx supabase@3.2.0 db push`.

## Patterns

```sql
create table public.thing (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  parent_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint thing_parent_fk foreign key (parent_id, user_id)
    references public.parent (id, user_id) on delete cascade
);
create index thing_parent_idx on public.thing (parent_id);
alter table public.thing enable row level security;
create policy "owner_all" on public.thing for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger set_updated_at before update on public.thing
  for each row execute function public.set_updated_at();
```

- Append-only tables: select + insert policies only.
- Worker-written tables: select policy only; workers use the service role.
- Protect system-owned columns with `revoke update … ; grant update (cols) …`.
- Functions: `security definer` only when required, always `set search_path = ''`.

## PGlite harness limits

Stubs `auth.users`, `auth.uid()`, `storage.buckets/objects`, `storage.foldername` and the `anon`/`authenticated`/`service_role` roles. Features outside that surface (Vault, pg_cron, realtime) need a real Supabase instance — note it in the test file.
