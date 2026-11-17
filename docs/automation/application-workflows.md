# Application workflows

Status: Preparation **implemented (Phase 5)**; approval, scheduling and submission **planned (Phase 6–7)**.

## Preparation (Application Studio)

1. User opens a qualified job → generate documents (cover letter, email, resume summary, skills emphasis) and
   screening answers from verified profile data.
2. Each section can be regenerated alone; every save creates a new `application_documents.version`.
3. Grounding check flags unsupported claims; the user edits until clean.
4. Answers sourced from AI start `is_verified = false`; the user verifies each one.
5. Approve → status `approved`, `approved_at` set, `application_events` row written.

## Submission

| Mode | When | Behavior |
| --- | --- | --- |
| Manual | Unsupported platform (LinkedIn, Indeed, JobStreet, CAPTCHA forms) | App gives documents + link; user submits and marks `applied` (`submission_method = manual`) |
| Assisted automation | Supported platform | Worker fills the form, captures screenshots, stops before submit for confirmation inside the window |

## Human-intervention stops

Automation sets `needs_attention` (run) / `failed` (application) and notifies when it meets: CAPTCHA, login or
expired session, a required field without verified data, sensitive questions (demographics, disability, criminal
history, salary history, visa specifics not in profile), automation blocked, or an unexpected page structure.

## Safeguards

Approval required · window + pause re-checked before final click · daily limit · atomic claim with lock and
idempotency key · one application per job · verification before `applied` · full event and run logs.
