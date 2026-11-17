# System architecture

## Deployment topology

```
Browser ──► Vercel (Next.js 16: Server Components, Server Actions, Route Handlers, proxy)
                │  user JWT (RLS applies)
                ▼
            Supabase ── Postgres (RLS) · Auth · Storage (private buckets) · Vault
                ▲
                │  secret key (scoped by user_id in code)
Trigger.dev workers ── scheduled discovery · AI batches · queue scheduler · Playwright automation   [Planned]
                │
                ├──► OpenAI API (structured outputs)                                              [Planned]
                └──► Job sources (Remote OK API, ATS public APIs, career pages)                    [Planned]
```

## Layers

| Layer | Location | Notes |
| --- | --- | --- |
| Presentation | `src/app/**`, `src/features/*/components`, `src/components` | Server Components by default |
| Application logic | `src/features/*/server/*-service.ts`, `actions.ts` | Validation, authorization, business rules |
| Data access | `src/features/*/server/*-repository.ts`, `supabase/migrations` | Supabase queries, row ↔ domain mapping |
| Cross-cutting server | `src/server/` | `requireUser`, `ActionResult`, errors |
| Scheduling | `src/lib/scheduling/` | Pure submission-window rules (single source of truth) |
| Monitoring | `src/lib/monitoring/` | Structured logger (Sentry planned) |
| AI services | `src/lib/ai/` | **Planned** — central OpenAI service, prompt versions, usage tracking |
| Integrations | `src/lib/integrations/` | **Planned** — job source connectors |
| Background processing | `src/trigger/` | **Planned** — Trigger.dev tasks |
| Browser automation | `src/lib/automation/` | **Planned** — Playwright flows, run only inside workers |

Folders marked Planned do not exist yet; they are created with their first real implementation.

## Request flow (implemented)

1. `src/proxy.ts` refreshes the Supabase session cookie (verifies the JWT with `getClaims`) and redirects
   unauthenticated requests to `/login` (optimistic check only).
2. Pages render a static shell; session-dependent content streams inside `<Suspense>` (`loading.tsx`).
3. Data reads call `requireUser()` → feature repository → Supabase with the user's JWT → RLS.
4. Mutations are Server Actions: `requireUser()` → Zod parse → repository → `refresh()` → `ActionResult`.

## Key decisions

- [ADR-001 Tech stack](architecture-decisions/ADR-001-tech-stack.md)
- [ADR-002 Database design](architecture-decisions/ADR-002-database.md)
- [ADR-003 Automation engine](architecture-decisions/ADR-003-automation-engine.md)
- [ADR-004 Folder structure](architecture-decisions/ADR-004-folder-structure.md)
