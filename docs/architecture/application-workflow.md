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

Allowed transitions are enforced in one place: `application_transition_allowed` in
`supabase/migrations/20261118000000_application_queue.sql`, applied by a trigger to every writer (user functions,
service role, workers). Every status change writes an `application_events` row.

| From | To |
| --- | --- |
| discovered, qualified | analyzing, qualified/discovered, archived, drafting, pending_approval, applied (applied elsewhere) |
| analyzing | discovered, qualified, archived |
| archived | discovered |
| drafting | archived, pending_approval, applied |
| pending_approval | archived, approved, scheduled, applied |
| approved, scheduled | pending_approval, scheduled/approved, applying, applied, withdrawn |
| applying | approved, scheduled, failed, applied (worker only) |
| failed | pending_approval, approved, scheduled, applied, withdrawn |
| applied | interview, assessment, rejected, withdrawn |
| interview, assessment | assessment/interview, rejected, withdrawn |

Changing a document, screening answer or the resume of an approved, scheduled or failed application returns it to
`pending_approval`; while `applying` those edits are refused.

## Submission sequence (Phase 6 contract, Phase 7 worker)

1. Approval (Phase 6): `approveApplicationAction` evaluates the window with server time; open → `approved` (due now), closed → `scheduled` with `scheduled_for = nextWindowStart` (`submitAfter` in `src/features/applications/queue.ts`).
2. Worker (Phase 7): load settings → `evaluateSubmissionWindow(now)`; closed → wait.
3. `claim_next_application(user, localDayBounds(now))` checks pause, enabled and the daily limit, then claims the next due application (`priority desc, created_at`) atomically with a lock token and a run row.
4. The Applications page shows the same decision per row with `queueState` (due / waiting until / daily limit / paused / automation off).
5. Run automation up to the final submit; **re-run step 2 and the pause check immediately before clicking submit**.
6. Verify the confirmation (page text/URL/email) → set `submitted_at`, `submission_verified_at`, status `applied`.
7. Any doubt → status `failed` with reason, notification, screenshots; never `applied`.
