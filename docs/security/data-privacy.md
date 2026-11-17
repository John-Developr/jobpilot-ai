# Data privacy

## Data held

| Category | Examples | Notes |
| --- | --- | --- |
| Identity | Name, email, phone, location | Entered by the user; email mirrors the auth account |
| Professional | Experience, skills, education, projects, resumes | Used for scoring and generation |
| Job data | Public listings | From sources or manual entry |
| Application data | Documents, answers, recruiter contacts, notes | Recruiter details are third-party personal data: store only what is needed |
| Operational | Run logs, screenshots, AI usage | Screenshots may contain personal data |

## Minimization

- No demographic data, government IDs, passwords for job sites, or payment data in tables.
- Sensitive form questions (demographics, disability, criminal history) are never auto-answered and answers are not stored unless the user enters them.
- Site credentials, if ever needed, live in Supabase Vault — not in tables or env files.
- Logs exclude document contents, tokens and secrets.

## Third parties

| Processor | Data sent |
| --- | --- |
| Supabase | All stored data (encrypted at rest) |
| Gemini (default) or OpenAI | Job text + relevant profile facts per call (Gemini free tier: Google may use this data to improve its products); for Ask JobPilot also the question, recent messages of that conversation and the read-only tool results (job, score, status, usage data; no contact details); API data is not used for training by default per OpenAI's API terms — re-check at integration time |
| Vercel / Trigger.dev | Request/worker logs |
| Sentry (Planned) | Error metadata; configure to scrub request bodies |

## Retention (target, implemented in Phase 8–9)

| Data | Retention |
| --- | --- |
| Automation screenshots | 90 days |
| Run step logs | 180 days |
| Archived jobs with no application activity | 180 days |
| Everything else | Until the user deletes it; deleting the account cascades all rows |
