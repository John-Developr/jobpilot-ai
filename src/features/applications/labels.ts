import type { QueueState } from "./queue";

/** Human labels for `application_events.event_type`; unknown types fall back to the raw value. */
const EVENT_LABELS: Record<string, string> = {
  "job.evaluated": "Scored",
  "job.archived": "Archived",
  "job.restored": "Restored",
  "application.drafting": "Drafting started",
  "application.ready_for_approval": "Ready for approval",
  "application.approved": "Approved",
  "application.approval_withdrawn": "Approval withdrawn",
  "application.submitted": "Applied",
  "application.claimed": "Submission started",
  "application.claim_released": "Submission postponed",
  "application.attempt_failed": "Submission attempt failed",
};

export function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType;
}

export type QueueTone = "success" | "warning" | "destructive" | "muted";

export function queueStateLabel(state: QueueState, formatInstant: (instant: Date) => string): { label: string; tone: QueueTone } {
  switch (state.kind) {
    case "due":
      return { label: "Due now", tone: "success" };
    case "waiting":
      return { label: `Due ${formatInstant(state.until)}`, tone: "muted" };
    case "daily_limit":
      return { label: "Daily limit reached", tone: "warning" };
    case "paused":
      return { label: "Paused", tone: "destructive" };
    case "automation_off":
      return { label: "Ready · submit yourself", tone: "muted" };
    case "no_window":
      return { label: "No submission window set", tone: "warning" };
  }
}
