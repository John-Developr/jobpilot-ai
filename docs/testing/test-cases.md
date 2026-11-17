# Test cases

## Implemented

### Submission window — `tests/unit/scheduling/submission-window.test.ts`

| Case | Expected |
| --- | --- |
| Monday 09:00:00 Manila | Open, closes 17:00 |
| Monday 08:59:59 | Closed `before_window`, next = 09:00 same day |
| Monday 16:59:59 | Open |
| Monday 17:00:00 | Closed `after_window`, next = Tuesday 09:00 |
| Task starts 16:58, submit at 17:00:30 | Open at start, closed at submit |
| Saturday 10:00 | Closed `non_working_day`, next = Monday 09:00 |
| Sunday 12:00 | Closed `non_working_day` |
| Friday 18:30 | Closed `after_window`, next = Monday 09:00 |
| Same instant, Manila vs New York | Uses configured timezone |
| Paused during window | Closed `paused` |
| Disabled | Closed `disabled` |
| No working days | Closed, no next window |
| New York after DST change | Correct UTC instant for 09:00 |
| Inverted window | Throws |
| `localDayBounds` Manila | 16:00Z previous day → 16:00Z |
| Time parsing / timezone validation | Valid accepted, invalid rejected |

### Database — `tests/integration/db/schema.test.ts`

| Case | Expected |
| --- | --- |
| New auth user | Profile, preferences, settings rows with Manila defaults |
| Read another user's jobs | 0 rows |
| Insert row for another user | RLS violation |
| Owner inserts own skill | Succeeds |
| Update audit event / insert as `automation` actor | 0 rows affected / RLS violation |
| Duplicate dedupe hash | `jobs_dedupe_unique` |
| Second application for a job | `applications_one_per_job` |
| Application referencing another user's job | `applications_job_fk` |
| Automated `applied` without verification | `applications_verified_automation` |
| Window start after end | `automation_settings_window` |
| User sets `submission_verified_at` or lock | permission denied |
| User updates notes/status | Succeeds |
| anon selects jobs | permission denied |
| Buckets private | `documents`, `automation` not public |
| Upload into another user's folder | RLS violation |

### Phase 2 — `tests/unit/profile/*.test.ts`, `tests/integration/db/resumes.test.ts`

| Case | Expected |
| --- | --- |
| Experience: past role without end / current role with end / end before start / bad month | Field error on `endMonth` / `startMonth` |
| Schemas re-validate their own output | Idempotent (client and server use the same schema) |
| Links: `javascript:`, `ftp:`, bare domain, `https://` | Rejected |
| Preferences: min > max, no employment types, `unknown` arrangement, bad currency | Rejected with field paths |
| Resume MIME guard / size limit | Only PDF/DOCX ≤ 10 MB; prototype keys rejected |
| Month/date conversions and formatting | Timezone-independent |
| Two default resumes | `resumes_one_default_idx` |
| `set_default_resume` own / other user / anon | Moves default / "resume not found" / permission denied |
| Duplicate skill differing in case | `professional_skills_unique_name` |
| Current job with end date | `professional_experiences_current` |
| User edits profile email | permission denied |

### Phase 3 — `tests/unit/job-sources/*`, `tests/unit/jobs/*`, `tests/integration/db/jobs.test.ts`

| Case | Expected |
| --- | --- |
| Parsers on real Remote OK / Greenhouse / Lever / Ashby payloads | Valid normalized jobs; legal notice and unlisted jobs skipped |
| Remote OK salaries 0, 21, 114M | Dropped as implausible |
| Greenhouse entity-escaped HTML | Clean text |
| Unexpected payload shapes / malformed items | Empty result / counted as skipped |
| Canonical URLs, keyword token matching ("ios" not in "Studios"), fingerprints ("Inc." = "Inc") | As described |
| JSON-LD: typical posting, `@graph`, broken blocks, missing company | Parsed / found / skipped / null |
| SSRF: http, IP literals, localhost, .local, credentials, private ranges incl. IPv6 and mapped IPv4 | Rejected |
| Search sanitizer strips PostgREST syntax, keeps "C#", "C++", "Node.js" | As described |
| `ingest_jobs`: new, duplicate by hash/URL/external id/within batch, null remote type, other user's source, anon | 1 inserted / skipped / `unknown` / error / denied |
| `set_job_archived`: archive, idempotent, restore, submitted job, other user's job | Events written / unchanged / `discovered` / refused / not found |

### Portfolio sync — `tests/unit/profile/portfolio-mapping.test.ts`, `tests/integration/db/portfolio-sync.test.ts`

| Case | Expected |
| --- | --- |
| Profile trimming, empty values | null, never erase local |
| Links: only http(s); match local URL ignoring case/www/trailing slash | Linked / skipped |
| Experience: same company + start month, then ±1 month; "Acme, Inc." = "ACME Inc" | Linked, no duplicate |
| Education: contains-match ("Main" vs "Main Campus"); milestones | Linked / skipped with reason |
| Skills: case and ".js" insensitive; duplicates; language override for category | Linked / deduped / category |
| Sync SQL keeps achievements, technologies, location; portfolio dates/current win | As described |
| Re-sync | Idempotent counts |
| Items removed in portfolio | Unlinked, not deleted |
| Linking another user's row; anon | Ignored / denied |
| Portfolio reader role (temporary run on all portfolio migrations) | Reads allowed columns; denied private columns, other tables, writes |

### Phase 4 — `tests/unit/evaluation/*`, `tests/integration/db/evaluation.test.ts`

| Case | Expected |
| --- | --- |
| Remote / salary / employment-type rules incl. currency mismatch and period conversion | Deterministic scores |
| Weighted average, normalization, clamping, malformed weights | Defaults on bad input |
| Qualification boundaries 85/84/70/69/55/54 and status rules with min score | As specified |
| Candidate facts exclude name and phone; long descriptions capped | As described |
| Grounding drops skills not in the verified profile | Dropped |
| AI output: score > 100, fractional, unknown kind, missing field, null | Rejected |
| `record_job_evaluation`: stores, replaces requirements, latest score in view, protects late statuses, rejects others/anon | As described |
| Owner can append AI usage, cannot edit | As described |

### Phase 5 — `tests/unit/studio/*`, `tests/integration/db/studio.test.ts`

| Case | Expected |
| --- | --- |
| Grounding: verified skills and numbers pass; missing job skills and new numbers flagged once | As described |
| Signature only on letters/emails, only filled fields | As described |
| Versions numbered per kind; first save moves to drafting; late statuses untouched | As described |
| Other user / oversized content | Refused |
| Ready needs letter or email; blocked by flags on latest version unless confirmed; idempotent | As described |
| Studio prompts seeded | Six active v1 prompts |

## Planned

| Area | Phase |
| --- | --- |
| Sign-in/out, settings, pause, profile CRUD, resume upload/download e2e | 3 (needs Supabase test project) |
| Scoring math, qualification thresholds, AI output schema rejection | 4 |
| Grounding check flags invented skills/employers | 5 |
| State machine transitions, claim concurrency, daily limit under concurrency, idempotent retries | 6 |
| Flow adapters: CAPTCHA/login/changed layout → stop; never `applied` without evidence | 7 |
