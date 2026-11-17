import { z } from "zod";
import { isValidTimezone, parseTimeOfDay } from "@/lib/scheduling/submission-window";

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM.");

const wholeNumber = (min: number, max: number) =>
  z
    .number({ error: "Enter a number." })
    .int("Enter a whole number.")
    .min(min, `Must be at least ${min}.`)
    .max(max, `Must be at most ${max}.`);

export const automationScheduleSchema = z
  .object({
    isEnabled: z.boolean(),
    timezone: z.string().refine(isValidTimezone, "Unknown timezone."),
    workingDays: z
      .array(z.number().int().min(1).max(7))
      .refine((days) => new Set(days).size === days.length, "Days must be unique."),
    windowStart: timeOfDay,
    windowEnd: timeOfDay,
    dailyApplicationLimit: wholeNumber(0, 100),
    minMatchScore: wholeNumber(0, 100),
    maxRetries: wholeNumber(0, 10),
    retryBackoffMinutes: wholeNumber(1, 1440),
  })
  .refine(
    (value) => {
      try {
        return parseTimeOfDay(value.windowStart) < parseTimeOfDay(value.windowEnd);
      } catch {
        return true; // Format errors are reported on the individual fields.
      }
    },
    { path: ["windowEnd"], message: "End time must be after start time." },
  );

export type AutomationScheduleInput = z.infer<typeof automationScheduleSchema>;

export const emergencyPauseSchema = z.discriminatedUnion("paused", [
  z.object({ paused: z.literal(true), reason: z.string().trim().max(200).optional() }),
  z.object({ paused: z.literal(false) }),
]);

export type EmergencyPauseInput = z.infer<typeof emergencyPauseSchema>;

export const WEEKDAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
] as const;
