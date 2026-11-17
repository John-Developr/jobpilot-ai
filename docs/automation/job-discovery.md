# Job discovery

Status: **Implemented (Phase 3)** — on-demand "Sync now"; scheduled runs arrive in Phase 7. Code: `src/lib/integrations/job-sources/`, `src/features/jobs/`.

## Flow

1. "Sync now" (`syncSourceAction` → `syncSource`) loads the user source row; it must be enabled and outside the cooldown.
2. `runConnector` validates the stored config with the connector schema and fetches the public API (15 s timeout per request).
3. The connector parser validates each raw item with Zod and maps it to `NormalizedJob`: title, company, location, remote type, employment type, salary (min/max/currency/period), description (plain text), posted date, canonical URL.
4. Keyword filter (title + source tags, whole-token match), schema validation, newest first, max 500 per sync.
5. Duplicates: `dedupe_hash` = SHA-256 of folded `company|title|location`; plus unique canonical URL (tracking params stripped) and unique `(source, external id)`.
6. `ingest_jobs` inserts new jobs and their `discovered` applications atomically, skipping any duplicate.
7. Record `job_sources.last_synced_at` and `last_error` (warnings such as an unknown board name are kept there). `automation_runs` rows are added with background workers (Phase 7).

Cooldown: 10 minutes per source between successful syncs.

## Connectors

| Key | Source | Method |
| --- | --- | --- |
| `remoteok` | Remote OK | Public JSON API; keep attribution link to the original listing |
| `greenhouse` | Company boards on Greenhouse | `boards-api.greenhouse.io/v1/boards/<company>/jobs?content=true` |
| `lever` | Company boards on Lever | `api.lever.co/v0/postings/<company>?mode=json` |
| `ashby` | Company boards on Ashby | Public job board API |
| (manual) "Fill from page" | Any site with schema.org `JobPosting` | SSRF-guarded fetch, JSON-LD only; never for LinkedIn, Indeed, JobStreet, SEEK, Glassdoor |
| `manual` | LinkedIn, Indeed, JobStreet, anything else | User pastes URL and details via Add job |

Connectors only call documented public job-board APIs with a generic User-Agent; no login-walled pages, no HTML scraping and no headless browsing for discovery.

## Filters (jobs list)

Implemented: title/company text search, location, minimum salary (`salary_upper`), employment type, work arrangement, source, active/archived. Server-side via the `job_listings` view, 25 per page, ordered by `discovered_at desc` (indexed). Qualification-level filters arrive with scoring (Phase 4).
