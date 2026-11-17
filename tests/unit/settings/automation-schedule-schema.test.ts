import { describe, expect, it } from "vitest";
import { automationScheduleSchema, emergencyPauseSchema } from "@/features/settings/schemas";

const valid = {
  isEnabled: true,
  timezone: "Asia/Manila",
  workingDays: [1, 2, 3, 4, 5],
  windowStart: "09:00",
  windowEnd: "17:00",
  dailyApplicationLimit: 10,
  minMatchScore: 70,
  maxRetries: 3,
  retryBackoffMinutes: 30,
};

const issuesFor = (input: unknown) => {
  const result = automationScheduleSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
};

describe("automationScheduleSchema", () => {
  it("accepts the default schedule", () => {
    expect(automationScheduleSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an end time that is not after the start time", () => {
    expect(issuesFor({ ...valid, windowEnd: "09:00" })).toEqual(["windowEnd"]);
    expect(issuesFor({ ...valid, windowStart: "18:00" })).toEqual(["windowEnd"]);
  });

  it("rejects malformed times", () => {
    expect(issuesFor({ ...valid, windowStart: "9:00" })).toContain("windowStart");
    expect(issuesFor({ ...valid, windowEnd: "24:00" })).toContain("windowEnd");
  });

  it("rejects unknown timezones", () => {
    expect(issuesFor({ ...valid, timezone: "Mars/Olympus" })).toEqual(["timezone"]);
  });

  it("rejects invalid or duplicate weekdays", () => {
    expect(issuesFor({ ...valid, workingDays: [0] })).toContain("workingDays.0");
    expect(issuesFor({ ...valid, workingDays: [1, 1] })).toEqual(["workingDays"]);
  });

  it("enforces numeric ranges", () => {
    expect(issuesFor({ ...valid, dailyApplicationLimit: 101 })).toEqual(["dailyApplicationLimit"]);
    expect(issuesFor({ ...valid, minMatchScore: -1 })).toEqual(["minMatchScore"]);
    expect(issuesFor({ ...valid, retryBackoffMinutes: 0 })).toEqual(["retryBackoffMinutes"]);
    expect(issuesFor({ ...valid, maxRetries: Number.NaN })).toEqual(["maxRetries"]);
    expect(issuesFor({ ...valid, dailyApplicationLimit: 2.5 })).toEqual(["dailyApplicationLimit"]);
  });
});

describe("emergencyPauseSchema", () => {
  it("accepts pause with optional reason and resume", () => {
    expect(emergencyPauseSchema.safeParse({ paused: true, reason: "Vacation" }).success).toBe(true);
    expect(emergencyPauseSchema.safeParse({ paused: true }).success).toBe(true);
    expect(emergencyPauseSchema.safeParse({ paused: false }).success).toBe(true);
  });

  it("rejects overly long reasons", () => {
    expect(emergencyPauseSchema.safeParse({ paused: true, reason: "x".repeat(201) }).success).toBe(false);
  });
});
