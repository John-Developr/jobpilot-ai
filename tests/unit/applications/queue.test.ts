import { describe, expect, it } from "vitest";
import { queueState, submitAfter, type QueueStateInput } from "@/features/applications/queue";
import { evaluateSubmissionWindow } from "@/lib/scheduling/submission-window";

const settings: QueueStateInput["settings"] = {
  isEnabled: true,
  isPaused: false,
  timezone: "Asia/Manila",
  workingDays: [1, 2, 3, 4, 5],
  windowStart: "09:00",
  windowEnd: "17:00",
  dailyApplicationLimit: 2,
};

/** Manila is UTC+8 with no DST. 2026-11-16 is a Monday. */
const manila = (isoLocal: string): Date => new Date(`${isoLocal}+08:00`);

const state = (now: Date, overrides: Partial<QueueStateInput> = {}) =>
  queueState({ now, settings, scheduledFor: null, submittedToday: 0, ...overrides });

describe("submitAfter", () => {
  it("is now while the window is open and the next window start otherwise", () => {
    expect(submitAfter(evaluateSubmissionWindow(manila("2026-11-16T10:00:00"), settings))).toBeNull();
    expect(submitAfter(evaluateSubmissionWindow(manila("2026-11-16T17:00:00"), settings))).toEqual(
      manila("2026-11-17T09:00:00"),
    );
  });

  it("leaves the time open when automation is off or paused (the worker re-checks)", () => {
    expect(submitAfter(evaluateSubmissionWindow(manila("2026-11-16T20:00:00"), { ...settings, isEnabled: false }))).toBeNull();
    expect(submitAfter(evaluateSubmissionWindow(manila("2026-11-16T20:00:00"), { ...settings, isPaused: true }))).toBeNull();
  });
});

describe("queueState", () => {
  it("is due inside the window when nothing else blocks", () => {
    expect(state(manila("2026-11-16T10:00:00"))).toEqual({ kind: "due" });
  });

  it("waits for the next window outside working hours, exclusive end", () => {
    expect(state(manila("2026-11-16T17:00:00"))).toEqual({ kind: "waiting", until: manila("2026-11-17T09:00:00") });
    expect(state(manila("2026-11-21T10:00:00"))).toEqual({ kind: "waiting", until: manila("2026-11-23T09:00:00") });
  });

  it("waits for a future schedule inside the window", () => {
    const retryAt = manila("2026-11-16T11:30:00");
    expect(state(manila("2026-11-16T11:00:00"), { scheduledFor: retryAt })).toEqual({ kind: "waiting", until: retryAt });
  });

  it("moves a schedule that falls after hours to the next window", () => {
    expect(state(manila("2026-11-16T16:50:00"), { scheduledFor: manila("2026-11-16T17:20:00") })).toEqual({
      kind: "waiting",
      until: manila("2026-11-17T09:00:00"),
    });
  });

  it("ignores schedules in the past", () => {
    expect(state(manila("2026-11-16T10:00:00"), { scheduledFor: manila("2026-11-13T09:00:00") })).toEqual({ kind: "due" });
  });

  it("stops at the daily limit", () => {
    expect(state(manila("2026-11-16T10:00:00"), { submittedToday: 2 })).toEqual({ kind: "daily_limit" });
  });

  it("reports pause and automation off before anything else", () => {
    expect(state(manila("2026-11-16T10:00:00"), { settings: { ...settings, isPaused: true } })).toEqual({ kind: "paused" });
    expect(state(manila("2026-11-16T10:00:00"), { settings: { ...settings, isEnabled: false } })).toEqual({
      kind: "automation_off",
    });
  });
});
