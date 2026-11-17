/** Row ↔ form value conversions shared by profile repositories and display code. */

/** Form text uses "" for empty; the database uses NULL. */
export const emptyToNull = (value: string): string | null => (value === "" ? null : value);
export const nullToEmpty = (value: string | null): string => value ?? "";

/** "2024-07" → "2024-07-01" (dates are stored month-precise). */
export const monthToDate = (month: string): string | null => (month ? `${month}-01` : null);

/** "2024-07-01" → "2024-07". */
export const dateToMonth = (date: string | null): string => (date ? date.slice(0, 7) : "");

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** "2024-07" → "Jul 2024". */
export function formatMonth(month: string): string {
  if (!month) return "";
  return MONTH_FORMAT.format(new Date(`${month}-01T00:00:00Z`));
}

/** "Jul 2023 – Present", "2015 – 2021" style range; empty when both ends are unknown. */
export function formatMonthRange(start: string, end: string, isCurrent = false): string {
  const from = formatMonth(start);
  const to = isCurrent ? "Present" : formatMonth(end);
  if (!from && !to) return "";
  if (!from) return to;
  if (!to) return from;
  return `${from} – ${to}`;
}
