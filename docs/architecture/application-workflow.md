# Application workflow

Status: **Planned** except the schedule validator (implemented) and the schema (implemented).

## Pipeline

```
Job sources → Connectors → Ingestion (normalize + dedupe) → jobs
  → AI analysis (requirements) → Qualification engine (scores) → application status
  → Application generator (documents, answers) → pending_approval
  → Human approval → approved → Scheduler → scheduled
  → Schedule validator + pause + daily limit + claim (lock, idempotency) → applying
  → Browser automation (supported flows) → submission verification → applied | failed | needs attention
  → Tracker (interview, assessment, rejected, withdrawn, follow-ups)
```

Each stage is an independent task that reads its input from the database and writes its output back,
so any stage can be retried or run manually without the others.

## Application statuses

| Status | Set by | Meaning |
| --- | --- | --- |
| `discovered` | ingestion | Job saved, not yet analyzed |
| `analyzing` | analysis task | AI evaluation in progress |
| `qualified` | qualification | Score ≥ minimum match score |
| `archived` | qualification / user | Score < 55 or dismissed (kept for history, never deleted automatically) |
| `drafting` | generator | Documents being prepared |
| `pending_approval` | generator | Waiting for the user |
| `approved` | user | User approved documents and submission |
| `scheduled` | scheduler | Waiting for an eligible window (`scheduled_for`) |
| `applying` | submission service | Claimed; automation running |
| `applied` | submission service / user | Verified automated submission, or user-confirmed manual submission |
| `failed` | submission service | Failed after retries or needs human intervention |
| `interview` / `assessment` / `rejected` / `withdrawn` | user | Post-submission tracking |

Allowed transitions will be enforced in one state-machine module (Phase 6) and every transition writes an
`application_events` row.

## Submission sequence (Phase 6–7)

1. Scheduler picks `approved`/`scheduled` applications ordered by `priority desc, created_at`.
2. For each: load settings → `evaluateSubmissionWindow(now)`; closed → set `scheduled_for = nextWindowStart`.
3. Count today's submissions (`localDayBounds`) against `daily_application_limit`.
4. Claim atomically (DB function: set `lock_token`, `locked_at`, status `applying` where unlocked and still approved/scheduled).
5. Run automation up to the final submit; **re-run step 2 and the pause check immediately before clicking submit**.
6. Verify the confirmation (page text/URL/email) → set `submitted_at`, `submission_verified_at`, status `applied`.
7. Any doubt → status `failed` with reason, notification, screenshots; never `applied`.
