# Product requirements

Single user, personal productivity. Designed so multi-user support needs no rewrite (every row is
owned by `user_id` and protected by RLS).

## Goals

1. Save time on discovery, screening and form filling.
2. Improve application quality with tailored, truthful materials.
3. Operate safely: human approval, working-hours window, daily limits, no ToS violations.

## Functional requirements

| ID | Requirement | Phase |
| --- | --- | --- |
| FR-1 | Discover jobs from independent, configurable source connectors; manual entry | 3 |
| FR-2 | Extract and normalize job data; detect duplicates; keep source URL and timestamps | 3 |
| FR-3 | Filter jobs by title, location, salary, employment type, remote status | 3 |
| FR-4 | Score jobs: technical skills 30, experience 20, responsibilities 20, remote 15, salary 10, employment type 5 (configurable) | 4 |
| FR-5 | Qualification: 85–100 high priority, 70–84 recommended, 55–69 manual review, <55 archive | 4 |
| FR-6 | Store overall + criteria scores, matched/missing skills, gaps, factors, explanation, model, prompt version | 4 |
| FR-7 | Maintain profile, experience, skills, education, certifications, projects, links, preferences, salary, remote | 2 |
| FR-8 | Multiple resume versions per job category | 2 |
| FR-9 | Generate cover letters, emails, resume summaries, skill emphasis, screening answers, recruiter messages; regenerate per section; version; edit; export | 5 |
| FR-10 | Queue with statuses Discovered → … → Applied/Failed/Interview/Assessment/Rejected/Withdrawn (+ Archived) | 6 |
| FR-11 | Prioritization, manual approval, scheduling, safe retry, duplicate prevention, daily limit, execution history | 6 |
| FR-12 | Browser automation for supported flows with screenshots, validation and human-intervention stops | 7 |
| FR-13 | Tracker with table and kanban views, recruiter info, interviews, notes, follow-ups | 8 |
| FR-14 | Dashboard metrics and charts from real records with date filters | 8 |
| FR-15 | In-app notifications for qualified jobs, approvals, submissions, failures, interviews, follow-ups | 8 |
| FR-16 | Settings: enabled, working days, hours, timezone, daily limit, min score, sources, approval, retries, notifications | 1 (partial), 3, 8 |
| FR-17 | Emergency pause | 1 |

## Business rules (non-negotiable)

- Timezone Asia/Manila; Monday–Friday; 09:00–17:00; no weekend submissions (defaults, configurable).
- Daily limit 10 (configurable). Every application needs human approval (current release).
- Discovery and drafting may run any time; **submission** is validated against the schedule with server time
  immediately before the final submit action. A task that would submit at or after 17:00 stops.
- Applications approved outside the window stay queued until the next eligible window.
- Never report a submission as successful unless verified.
- Never invent experience, qualifications, skills or achievements.
- Never bypass CAPTCHA, anti-bot protection, access restrictions or authentication.
- Never auto-reject a job on an unexplained AI judgement.

## Non-functional requirements

Accessibility (WCAG 2.1 AA contrast, keyboard use), responsive (390px → desktop), structured logs, AI usage
tracking, pagination on lists, no AI calls in request paths when avoidable, secrets only server-side.

## Gaps and clarifications

- **Salary currency**: defaults to PHP/month; jobs in other currencies are scored on raw ranges only until a
  conversion source is chosen (Phase 4 decision).
- **"Archived" status** added to the queue statuses to represent jobs scoring below 55 (see ADR-002).
- **Supported automation flows** must be confirmed per platform against its terms before implementation (Phase 7).
