# Scheduling rules

Status: **Implemented** — rules engine (`src/lib/scheduling/submission-window.ts`), settings storage and UI,
dashboard status. The background scheduler that applies these rules is **Planned (Phase 6)**.

## Defaults (per user, `automation_settings`)

| Setting | Default |
| --- | --- |
| Automated submissions | Off until the user enables them |
| Timezone | `Asia/Manila` |
| Working days | Monday–Friday (`{1,2,3,4,5}`, ISO weekdays) |
| Window | 09:00 (inclusive) – 17:00 (exclusive) |
| Daily limit | 10 |
| Minimum match score | 70 |
| Human approval | Required (locked on in this release) |
| Retries | 3, 30-minute backoff |

## Rules

1. Discovery, analysis and drafting may run at any time.
2. Only the **final submit action** is restricted.
3. `evaluateSubmissionWindow(now, settings)` decides, with `now` = server time. Browser time is never used.
4. Order of checks: disabled → paused → working day → before window → after window.
5. End time is exclusive: at exactly 17:00:00 the window is closed.
6. A task that started inside the window must re-check immediately before submitting; if it is now 17:00 or later it stops and the application stays queued.
7. Applications approved outside the window keep status `scheduled` with `scheduled_for = nextWindowStart`.
8. Daily limit counts verified submissions within `localDayBounds(now, timezone)`.
9. Emergency pause blocks submissions immediately and has no automatic expiry.

## API

```ts
evaluateSubmissionWindow(now, settings)
  → { open: true, windowEnd } | { open: false, reason, nextWindowStart }
localDayBounds(now, timezone) → { start, end }   // UTC instants of the local day
isValidTimezone(tz), parseTimeOfDay("09:00")
```

DST-safe for any IANA timezone (Asia/Manila has no DST). Covered by `tests/unit/scheduling/submission-window.test.ts`.
