# Integration architecture

Status: job sources **implemented (Phase 3)**; OpenAI, Trigger.dev, automation **planned**.

## Job source connectors

Each connector is an independent module implementing one contract:

```ts
interface JobSourceConnector {
  key: string;                         // matches job_sources.connector_key
  kind: "api" | "feed" | "career_page" | "manual";
  configSchema: z.ZodType;             // validates job_sources.config
  fetchJobs(config, since?): Promise<RawJob[]>;   // network + parsing only
}
```

`normalizeJob(raw) → NormalizedJob` and `dedupeHash(job)` are shared. A connector failure records
`job_sources.last_error` and an `automation_runs` failure; other connectors keep running.

## Source support matrix

| Source | Access | Plan |
| --- | --- | --- |
| Remote OK | Public JSON API (attribution + link back required by its terms) | Automated discovery |
| Company career pages | Greenhouse / Lever / Ashby public job-board APIs; schema.org `JobPosting` JSON-LD | Automated discovery for configured companies |
| LinkedIn | No permitted public job-search API; scraping and automated applying violate its terms | Manual import (URL + pasted description) |
| Indeed | Publisher job-search API closed to new users; scraping prohibited | Manual import |
| JobStreet (SEEK) | No public job-seeker API | Manual import |

Before enabling any automated discovery or submission on a site, its current terms must be checked and the
outcome recorded in this file.

| Checked | Source | Outcome |
| --- | --- | --- |
| 2026-11-17 | Remote OK API | Allowed with a followed link back to the listing and "Remote OK" named as source; logo not used. Implemented: listing links (`rel="noopener"`, no nofollow) and "Listing via Remote OK". |
| 2026-11-17 | Greenhouse / Lever / Ashby job-board APIs | Public, unauthenticated read APIs intended for publishing job boards. Read-only use. |
| 2026-11-17 | LinkedIn, Indeed, JobStreet/SEEK, Glassdoor | Not fetched at all; manual entry only. |

## Other integrations

| Integration | Purpose | Secrets |
| --- | --- | --- |
| Gemini (default) or OpenAI | Analysis, scoring, generation, Ask JobPilot | `GEMINI_API_KEY` or `OPENAI_API_KEY`, `AI_PROVIDER` (server only) |
| Trigger.dev | Background tasks | `TRIGGER_SECRET_KEY` |
| Sentry | Error reporting | `SENTRY_DSN` |
| Email provider (optional) | Notifications | Provider key (server only) |
| Site logins for automation | Browser sessions | Stored in Supabase Vault, referenced by `integration_connections.vault_secret_id` |
