# Failed automation

Status: applies from Phase 7. Until then no automation runs; failed applications only appear if set by the worker contract.

## First response

1. If failures repeat or anything looks wrong: **Settings → Emergency pause.** This blocks all submissions immediately.
2. Open the failed run (`automation_runs`): status, `error_code`, step log, screenshots.
3. Check the application's `application_events` for the last transition.

## By error

| `error_code` | Meaning | Action |
| --- | --- | --- |
| `captcha` | CAPTCHA shown | Complete the application manually; mark applied (manual) |
| `login_required` / `session_expired` | Site wants login | Re-authenticate the integration (if supported) or apply manually |
| `missing_information` | Required field without verified data | Add the data to your profile or verify the answer, then re-approve |
| `sensitive_question` | Demographic/legal/salary-history question | Answer manually |
| `layout_changed` | Page structure not recognized | Apply manually; open an issue to update the adapter (attach screenshots) |
| `blocked` | Platform blocked automation | Apply manually; disable automation for that platform |
| `outside_window` / `paused` | Stopped before submit by the schedule/pause | No action; it stays queued |
| `verification_failed` | Submit clicked but no confirmation evidence | **Do not retry.** Check the site/email manually, then mark applied (manual) or failed |
| `transient` | Network / 5xx | Retried automatically up to `max_retries` |

## Never

Retry a submission whose outcome is unknown; mark an application applied without evidence; disable approval to "unstick" the queue.
