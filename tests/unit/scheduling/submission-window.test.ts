import { describe, expect, it } from "vitest";
import {
  evaluateSubmissionWindow,
  isValidTimezone,
  localDayBounds,
  parseTimeOfDay,
  type SubmissionScheduleSettings,
} from "@/lib/scheduling/submission-window";

const manila: SubmissionScheduleSettings = {
  isEnabled: true,
  isPaused: false,
  timezone: "Asia/Manila",
  workingDays: [1, 2, 3, 4, 5],
  windowStart: "09:00",
  windowEnd: "17:00",
};

/** Manila is UTC+8 with no DST. 2026-11-16 is a Monday. */
const manilaTime = (isoLocal: string): Date => new Date(`${isoLocal}+08:00`);

describe("evaluateSubmissionWindow", () => {
  it("opens exactly at the start of the window", () => {
    const status = evaluateSubmissionWindow(manilaTime("2026-11-16T09:00:00"), manila);
    expect(status).toEqual({ open: true, windowEnd: manilaTime("2026-11-16T17:00:00") });
  });

  it("is closed one second before the window opens", () => {
    const status = evaluateSubmissionWindow(manilaTime("2026-11-16T08:59:59"), manila);
    expect(status).toEqual({
      open: false,
      reason: "before_window",
      nextWindowStart: manilaTime("2026-11-16T09:00:00"),
    });
  });

  it("is open one second before the window closes", () => {
    expect(evaluateSubmissionWindow(manilaTime("2026-11-16T16:59:59"), manila).open).toBe(true);
  });

  it("closes exactly at the end of the window (end is exclusive)", () => {
    const status = evaluateSubmissionWindow(manilaTime("2026-11-16T17:00:00"), manila);
    expect(status).toEqual({
      open: false,
      reason: "after_window",
      nextWindowStart: manilaTime("2026-11-17T09:00:00"),
    });
  });

  it("stops a task that started in-window but reaches submission after 17:00", () => {
    const taskStart = manilaTime("2026-11-16T16:58:00");
    const submitMoment = manilaTime("2026-11-16T17:00:30");
    expect(evaluateSubmissionWindow(taskStart, manila).open).toBe(true);
    expect(evaluateSubmissionWindow(submitMoment, manila).open).toBe(false);
  });

  it("is closed on Saturday and points to Monday 09:00", () => {
    const status = evaluateSubmissionWindow(manilaTime("2026-11-21T10:00:00"), manila);
    expect(status).toEqual({
      open: false,
      reason: "non_working_day",
      nextWindowStart: manilaTime("2026-11-23T09:00:00"),
    });
  });

  it("is closed on Sunday", () => {
    expect(evaluateSubmissionWindow(manilaTime("2026-11-22T12:00:00"), manila)).toMatchObject({
      open: false,
      reason: "non_working_day",
    });
  });

  it("rolls Friday evening over to Monday morning", () => {
    expect(evaluateSubmissionWindow(manilaTime("2026-11-20T18:30:00"), manila)).toEqual({
      open: false,
      reason: "after_window",
      nextWindowStart: manilaTime("2026-11-23T09:00:00"),
    });
  });

  it("uses the configured timezone, not the host clock", () => {
    // 01:30 UTC Monday == 09:30 Monday in Manila, but still Sunday evening in New York.
    const instant = new Date("2026-11-16T01:30:00Z");
    expect(evaluateSubmissionWindow(instant, manila).open).toBe(true);
    expect(
      evaluateSubmissionWindow(instant, { ...manila, timezone: "America/New_York" }),
    ).toMatchObject({ open: false, reason: "non_working_day" });
  });

  it("emergency pause overrides an open window", () => {
    expect(
      evaluateSubmissionWindow(manilaTime("2026-11-16T10:00:00"), { ...manila, isPaused: true }),
    ).toEqual({ open: false, reason: "paused", nextWindowStart: null });
  });

  it("stays closed when automation is disabled", () => {
    expect(
      evaluateSubmissionWindow(manilaTime("2026-11-16T10:00:00"), { ...manila, isEnabled: false }),
    ).toMatchObject({ open: false, reason: "disabled" });
  });

  it("has no next window when no working days are configured", () => {
    expect(
      evaluateSubmissionWindow(manilaTime("2026-11-16T10:00:00"), { ...manila, workingDays: [] }),
    ).toEqual({ open: false, reason: "non_working_day", nextWindowStart: null });
  });

  it("handles DST transitions in other timezones", () => {
    // 2026-03-09 is the Monday after US DST starts (UTC-4).
    const ny = { ...manila, timezone: "America/New_York" };
    const status = evaluateSubmissionWindow(new Date("2026-03-09T12:59:00Z"), ny);
    expect(status).toEqual({
      open: false,
      reason: "before_window",
      nextWindowStart: new Date("2026-03-09T13:00:00Z"),
    });
  });

  it("rejects an inverted window", () => {
    expect(() =>
      evaluateSubmissionWindow(new Date(), { ...manila, windowStart: "17:00", windowEnd: "09:00" }),
    ).toThrow();
  });
});

describe("localDayBounds", () => {
  it("returns the Manila calendar day in UTC", () => {
    expect(localDayBounds(manilaTime("2026-11-16T23:59:00"), "Asia/Manila")).toEqual({
      start: new Date("2026-11-15T16:00:00Z"),
      end: new Date("2026-11-16T16:00:00Z"),
    });
  });
});

describe("helpers", () => {
  it("parses times of day", () => {
    expect(parseTimeOfDay("09:00")).toBe(540);
    expect(parseTimeOfDay("17:00:00")).toBe(1020);
    expect(() => parseTimeOfDay("25:00")).toThrow();
    expect(() => parseTimeOfDay("9am")).toThrow();
  });

  it("validates timezones", () => {
    expect(isValidTimezone("Asia/Manila")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
  });
});
