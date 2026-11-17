# Access control

## Principals

| Principal | How | Can do |
| --- | --- | --- |
| Anonymous | No session | Load `/login` only; no table access |
| Owner (`authenticated`) | Supabase session cookie | Own rows only, through RLS; restricted columns blocked by grants |
| Background worker | Secret key (`service_role`, bypasses RLS) | System-owned writes; must filter by `user_id` in code (Planned) |
| Migrations | Supabase CLI | Schema and prompt versions |

## Policy matrix (authenticated)

| Tables | select | insert | update | delete |
| --- | --- | --- | --- | --- |
| Profile data, resumes, sources, jobs, requirements, scores, documents, answers, settings, notifications | own | own | own | own |
| `profiles` | own | — (trigger) | own, editable columns only | — |
| `applications` | own | own, user columns | own, user columns | own |
| `application_events` | own | own, `actor = 'user'` | — | — |
| `automation_runs`, `ai_usage_events`, `integration_connections` | own | — | — | — |
| `prompt_versions` | all | — | — | — |
| Storage `documents/<uid>/…` | own | own | own | own |
| Storage `automation/<uid>/…` | own | — | — | — |

## Enforcement order

Proxy (redirect only) → `requireUser()` (JWT verified) → Zod validation → repository filters by `user_id` → RLS/grants.
All four server-side layers must hold; never rely on client checks or hidden UI.
