/**
 * Submission window rules — the single source of truth for "may we submit now?".
 *
 * Every submission path must call `evaluateSubmissionWindow` with server time
 * immediately before the final submit action. Discovery and drafting are not
 * restricted by this window. See docs/automation/scheduling-rules.md.
 */

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface SubmissionScheduleSettings {
  isEnabled: boolean;
  isPaused: boolean;
  timezone: string;
  workingDays: readonly number[];
  /** "HH:MM" or "HH:MM:SS", local to `timezone`. Inclusive. */
  windowStart: string;
  /** "HH:MM" or "HH:MM:SS", local to `timezone`. Exclusive. */
  windowEnd: string;
}

export type WindowClosedReason =
  | "disabled"
  | "paused"
  | "non_working_day"
  | "before_window"
  | "after_window";

export type SubmissionWindowStatus =
  | { open: true; windowEnd: Date }
  | { open: false; reason: WindowClosedReason; nextWindowStart: Date | null };

interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  weekday: IsoWeekday;
  /** Minutes since local midnight, with fractional seconds. */
  minuteOfDay: number;
}

const WEEKDAYS: Record<string, IsoWeekday> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timezone, formatter);
  }
  return formatter;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    formatterFor(timezone);
    return true;
  } catch {
    return false;
  }
}

function toLocal(instant: Date, timezone: string): LocalDateTime {
  const parts = formatterFor(timezone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Missing ${type} in formatted date`);
    return part.value;
  };
  const weekday = WEEKDAYS[get("weekday")];
  if (!weekday) throw new Error(`Unexpected weekday ${get("weekday")}`);
  const seconds = Number(get("second")) + instant.getUTCMilliseconds() / 1000;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday,
    minuteOfDay: Number(get("hour")) * 60 + Number(get("minute")) + seconds / 60,
  };
}

/** Parses "HH:MM" / "HH:MM:SS" into minutes since midnight. */
export function parseTimeOfDay(value: string): number {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw new Error(`Invalid time of day: ${value}`);
  const [hours, minutes, seconds] = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
  if (hours > 23 || minutes > 59 || seconds > 59) throw new Error(`Invalid time of day: ${value}`);
  return hours * 60 + minutes + seconds / 60;
}

/** Offset (ms) of `timezone` from UTC at `instant`. */
function offsetMs(instant: Date, timezone: string): number {
  const local = toLocal(instant, timezone);
  const minutes = Math.floor(local.minuteOfDay);
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    Math.floor(minutes / 60),
    minutes % 60,
    Math.round((local.minuteOfDay - minutes) * 60),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Converts a local wall-clock time in `timezone` to a UTC instant. */
function localToInstant(
  date: { year: number; month: number; day: number },
  minuteOfDay: number,
  timezone: string,
): Date {
  const wallClockAsUtc = Date.UTC(date.year, date.month - 1, date.day) + minuteOfDay * 60_000;
  // Two passes settle the offset across DST transitions.
  let instant = wallClockAsUtc - offsetMs(new Date(wallClockAsUtc), timezone);
  instant = wallClockAsUtc - offsetMs(new Date(instant), timezone);
  return new Date(instant);
}

function addLocalDays(
  date: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function isoWeekdayOf(date: { year: number; month: number; day: number }): IsoWeekday {
  const jsDay = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return (jsDay === 0 ? 7 : jsDay) as IsoWeekday;
}

/** Start of the next window strictly after `now` (or today's window if it has not opened yet). */
function findNextWindowStart(now: Date, settings: SubmissionScheduleSettings): Date | null {
  if (settings.workingDays.length === 0) return null;
  const local = toLocal(now, settings.timezone);
  const start = parseTimeOfDay(settings.windowStart);
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = addLocalDays(local, offset);
    if (!settings.workingDays.includes(isoWeekdayOf(date))) continue;
    if (offset === 0 && local.minuteOfDay >= start) continue;
    return localToInstant(date, start, settings.timezone);
  }
  return null;
}

/**
 * Decides whether a submission may happen at `now`.
 * The window is [windowStart, windowEnd) in the configured timezone, on working days only.
 */
export function evaluateSubmissionWindow(
  now: Date,
  settings: SubmissionScheduleSettings,
): SubmissionWindowStatus {
  const start = parseTimeOfDay(settings.windowStart);
  const end = parseTimeOfDay(settings.windowEnd);
  if (start >= end) throw new Error("windowStart must be before windowEnd");

  if (!settings.isEnabled) return { open: false, reason: "disabled", nextWindowStart: null };
  if (settings.isPaused) return { open: false, reason: "paused", nextWindowStart: null };

  const local = toLocal(now, settings.timezone);
  const nextWindowStart = findNextWindowStart(now, settings);

  if (!settings.workingDays.includes(local.weekday)) {
    return { open: false, reason: "non_working_day", nextWindowStart };
  }
  if (local.minuteOfDay < start) return { open: false, reason: "before_window", nextWindowStart };
  if (local.minuteOfDay >= end) return { open: false, reason: "after_window", nextWindowStart };

  return { open: true, windowEnd: localToInstant(local, end, settings.timezone) };
}

/**
 * UTC bounds of the local calendar day containing `now`, for counting
 * submissions against the daily limit.
 */
export function localDayBounds(now: Date, timezone: string): { start: Date; end: Date } {
  const local = toLocal(now, timezone);
  return {
    start: localToInstant(local, 0, timezone),
    end: localToInstant(addLocalDays(local, 1), 0, timezone),
  };
}
