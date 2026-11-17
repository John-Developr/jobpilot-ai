# Operational guide

## Daily (once the pipeline is live)

- Review **Pending approval** applications; edit and approve.
- Check notifications for failures and interview invitations.
- Glance at the dashboard submission-window status (open/closed, next window).

## Weekly

- Review archived and manual-review jobs for misjudged scores; adjust weights or minimum score in Settings.
- Check AI usage cost (Phase 8) and source errors (`job_sources.last_error`).
- Follow up on applications with due `follow_up_at`.

## Controls

| Control | Where | Effect |
| --- | --- | --- |
| Automated submissions on/off | Settings → Submission schedule | Off = nothing is submitted |
| Emergency pause | Dashboard or Settings → Safety | Immediate block of all submissions until resumed |
| Working days/hours/timezone | Settings | Applied at the next submission check |
| Daily limit | Settings | Counted per local calendar day |

## Logs

- Vercel: function logs, JSON lines with `event` names (`settings.*`, `automation.*`).
- Trigger.dev (Phase 6): per-run logs, linked from `automation_runs.external_run_id`.
- Sentry (Phase 8): exceptions.
