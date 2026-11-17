import { SALARY_PERIOD_LABELS } from "@/config/labels";
import type { DbEnum } from "@/types/database";

const compact = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, notation: "compact" });
const full = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "USD 60K–80K per year", "PHP 150,000 per month", or null when unknown. */
export function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null,
  period: DbEnum<"salary_period"> | null,
): string | null {
  const low = min ?? max;
  const high = max ?? min;
  if (low === null || high === null) return null;
  const fmt = (n: number) => (n >= 10_000 ? compact.format(n) : full.format(n));
  const range = low !== high ? `${fmt(low)}–${fmt(high)}` : fmt(low);
  const prefix = min === null ? "Up to " : max === null ? "From " : "";
  const amount = [currency, range, period ? SALARY_PERIOD_LABELS[period] : null].filter(Boolean).join(" ");
  return `${prefix}${amount}`;
}

/** "Nov 12, 2026" in the user's timezone. */
export function formatDate(iso: string | null, timezone: string): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", year: "numeric" }).format(
    new Date(iso),
  );
}

export function formatDateTime(iso: string | null, timezone: string): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
