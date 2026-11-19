# Project overview

## Purpose

JobPilot AI is a personal recruitment assistant for one developer. It removes the repetitive parts
of a job search — finding listings, judging fit, tailoring documents, filling forms, tracking
follow-ups — while keeping the human in control of every submission.

## Main features

| Feature | Status |
| --- | --- |
| Authentication (single user, Supabase Auth) | Implemented |
| App shell, navigation, light/dark design system | Implemented |
| Database schema for the full pipeline (RLS on every table) | Implemented (migrations) |
| Submission schedule engine (working hours, timezone, pause) | Implemented |
| Automation settings + emergency pause | Implemented |
| Profile, experience, skills, education, projects, preferences, resume versions + files | Implemented |
| Job discovery connectors, normalization, dedupe | Implemented (on-demand sync) |
| AI job evaluation and scoring | Implemented |
| Application Studio (cover letters, answers, exports) | Implemented |
| Queue, approval, scheduling, daily limits | Implemented (manual submission; worker in Phase 7) |
| Background worker (Trigger.dev): scheduled discovery, submission scheduler | Implemented, not deployed — Phase 7 |
| Supported browser automation (Playwright site adapters) | Planned — Phase 7 |
| Tracking (table/kanban), analytics, notifications, monitoring | Planned — Phase 8 |

## User workflow (target)

1. Maintain a verified professional profile and resume variants.
2. Connectors discover jobs (or paste a job URL/description manually).
3. AI extracts requirements and scores fit with explanations.
4. Qualified jobs get drafted materials in the Application Studio; the user edits and approves.
5. Approved applications are queued; submissions happen only inside the configured working window.
6. Supported forms are filled by browser automation, which stops for anything uncertain; the user confirms the final submit.
7. Every application is tracked through interviews, rejections and follow-ups; analytics show what works.

## Technology

See [ADR-001](architecture/architecture-decisions/ADR-001-tech-stack.md). Next.js 16 on Vercel, Supabase
(Postgres/Auth/Storage), OpenAI for analysis and generation, Trigger.dev for background work, Playwright for
browser automation.

## Architecture summary

Feature-based modules in `src/features/*` (UI + server logic per feature), cross-cutting server code in
`src/server`, infrastructure in `src/lib`. All data access is authenticated server-side and constrained by
Postgres RLS. Long-running work (discovery, AI batches, browser automation) runs in background workers, never
in request handlers. Details: [system architecture](architecture/system-architecture.md).

## Roadmap

[development-roadmap.md](development-roadmap.md).
