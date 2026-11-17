# Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Invalid or missing environment variables: NEXT_PUBLIC_SUPABASE_URL…` | `.env.local` missing or incomplete | Copy `.env.example`, fill values, restart `pnpm dev` |
| Redirect loop to `/login` | Session cookie not set (wrong URL/key, or site URL mismatch) | Check env values; Supabase Auth URL configuration includes your origin |
| "Incorrect email or password" for the right password | User not created / email unconfirmed | Create the user in Supabase dashboard with "Auto confirm" |
| Dashboard shows "Something went wrong"; logs show `RepositoryError: Automation settings row is missing` | Migrations not applied, or user created before migrations | `db push`; then insert the row: `insert into automation_settings (user_id) values ('<uid>')` (also `profiles`, `job_preferences`) |
| Settings save fails | RLS/column grant mismatch after a schema change | Check server logs for `settings.automation_schedule.update_failed`; run `pnpm test` |
| Build error about `cookies()` outside Suspense | Session read in a layout/page without a boundary | Move the read into a component inside `<Suspense>` or add `loading.tsx` |
| `LayoutProps` not found in typecheck | Route types not generated | `pnpm typecheck` (runs `next typegen` first) |
| Migration tests fail after editing SQL | Constraint/policy change | Read the failing assertion; update SQL or add a new migration — never weaken the test |
