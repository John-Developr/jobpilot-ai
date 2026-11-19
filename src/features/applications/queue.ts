import {
  evaluateSubmissionWindow,
  type SubmissionScheduleSettings,
  type SubmissionWindowStatus,
} from "@/lib/scheduling/submission-window";

/**
 * When a newly approved application may first be submitted: `null` means "now" (window open,
 * or automation off/paused, where the worker re-checks later); otherwise the next window start.
 * Passed to `approve_application`, which stores it as `scheduled_for`.
 */
export function submitAfter(window: SubmissionWindowStatus): Date | null {
  return window.open ? null : window.nextWindowStart;
}

export type QueueState =
  | { kind: "due" }
  | { kind: "waiting"; until: Date }
  | { kind: "daily_limit" }
  | { kind: "paused" }
  | { kind: "automation_off" }
  | { kind: "no_window" };

export interface QueueStateInput {
  /** Server time. */
  now: Date;
  settings: SubmissionScheduleSettings & { dailyApplicationLimit: number };
  /** Earliest submit time stored on the application (approval outside the window, retry backoff). */
  scheduledFor: Date | null;
  /** Submissions recorded in the user's local day, manual and automated (localDayBounds). */
  submittedToday: number;
}

/**
 * Where a queued (approved/scheduled) application stands, using the same rules the
 * submission worker applies: schedule and backoff first, then the window, then the daily limit.
 */
export function queueState({ now, settings, scheduledFor, submittedToday }: QueueStateInput): QueueState {
  const earliest = scheduledFor && scheduledFor > now ? scheduledFor : now;
  const window = evaluateSubmissionWindow(earliest, settings);
  if (!window.open) {
    if (window.reason === "disabled") return { kind: "automation_off" };
    if (window.reason === "paused") return { kind: "paused" };
    return window.nextWindowStart ? { kind: "waiting", until: window.nextWindowStart } : { kind: "no_window" };
  }
  if (earliest > now) return { kind: "waiting", until: earliest };
  if (submittedToday >= settings.dailyApplicationLimit) return { kind: "daily_limit" };
  return { kind: "due" };
}
