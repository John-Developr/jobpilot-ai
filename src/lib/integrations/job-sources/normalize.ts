import type { DbEnum } from "@/types/database";

/*
 * Pure normalization helpers shared by every connector and by manual entry.
 * No I/O here — everything is unit-tested against real payload fixtures.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const MAX_DESCRIPTION = 20_000;

/** Converts job-description HTML (possibly entity-escaped, as Greenhouse sends it) to readable plain text. */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null;
  let source = html;
  // Entity-escaped markup ("&lt;p&gt;") — decode once to real tags first.
  if (!source.includes("<") && /&lt;\/?[a-z]/i.test(source)) source = decodeEntities(source);

  const text = source
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    // Each <li> starts its own line, so </li> adds nothing (no blank lines between bullets).
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/li>/gi, "")
    .replace(/<\/(p|div|h[1-6]|ul|ol|section|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  const cleaned = decodeEntities(text)
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleaned) return null;
  return cleaned.length > MAX_DESCRIPTION ? `${cleaned.slice(0, MAX_DESCRIPTION - 1)}…` : cleaned;
}

/** Collapses whitespace; returns null for empty. */
export function cleanText(value: string | null | undefined, maxLength = 300): string | null {
  if (!value) return null;
  const cleaned = decodeEntities(value).replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

const TRACKING_PARAMS = /^(utm_.*|gclid|fbclid|msclkid|ref|refid|trk|trackingid|source|src|gh_src|lever-source.*|lever-origin|ashby_jid)$/i;

/** Canonical form of a posting URL: https, lowercase host, no tracking params, no fragment, no trailing slash. */
export function canonicalUrl(raw: string): string {
  const url = new URL(raw.trim());
  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  const kept = [...url.searchParams.entries()].filter(([key]) => !TRACKING_PARAMS.test(key));
  kept.sort(([a], [b]) => a.localeCompare(b));
  url.search = new URLSearchParams(kept).toString();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

/** Lowercase, accents and punctuation removed — for fingerprints and keyword matching. */
export function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}

/**
 * Input to the duplicate fingerprint: the same role at the same company and place,
 * whichever board it came from. Hashed with SHA-256 by the caller (server-side).
 */
export function fingerprintSource(job: { company: string; title: string; location: string | null }): string {
  // Dots are dropped so "Acme Inc." and "Acme Inc" fingerprint the same.
  const key = (value: string) => fold(value).replace(/\./g, "");
  return [key(job.company), key(job.title), key(job.location ?? "")].join("|");
}

export function parseEmploymentType(value: string | null | undefined): DbEnum<"employment_type"> | null {
  if (!value) return null;
  const v = value.toLowerCase().replace(/[\s_-]+/g, "");
  if (v.includes("fulltime") || v === "permanent" || v === "regular") return "full_time";
  if (v.includes("parttime")) return "part_time";
  if (v.includes("intern")) return "internship";
  if (v.includes("freelance")) return "freelance";
  if (v.includes("contract")) return "contract";
  if (v.includes("temp")) return "temporary";
  return null;
}

/** Explicit workplace type wins; otherwise infer from location/title text. */
export function detectRemoteType(
  explicit: string | null | undefined,
  ...texts: (string | null | undefined)[]
): DbEnum<"remote_type"> {
  const e = explicit?.toLowerCase().replace(/[\s_-]+/g, "");
  if (e === "remote" || e === "telecommute") return "remote";
  if (e === "hybrid") return "hybrid";
  if (e === "onsite" || e === "inoffice" || e === "office") return "onsite";
  const text = texts.filter(Boolean).join(" ").toLowerCase();
  if (/\bhybrid\b/.test(text)) return "hybrid";
  if (/\bremote\b|\banywhere\b|\bworldwide\b|work from home|\bwfh\b/.test(text)) return "remote";
  return "unknown";
}

const MIN_PLAUSIBLE: Record<DbEnum<"salary_period">, number> = { hour: 1, day: 10, month: 100, year: 1_000 };
const MAX_PLAUSIBLE = 10_000_000;

/**
 * Keeps a salary range only when it is plausible for its period. Zero or absurd values
 * (common in feeds) become null instead of misleading the matcher.
 */
export function sanitizeSalary(input: {
  min: number | null | undefined;
  max: number | null | undefined;
  currency: string | null | undefined;
  period: DbEnum<"salary_period"> | null | undefined;
}): {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: DbEnum<"salary_period"> | null;
} {
  const period = input.period ?? null;
  const currency = input.currency && /^[A-Za-z]{3}$/.test(input.currency) ? input.currency.toUpperCase() : null;
  const plausible = (n: number | null | undefined): n is number =>
    typeof n === "number" && Number.isFinite(n) && period !== null && n >= MIN_PLAUSIBLE[period] && n <= MAX_PLAUSIBLE;

  let min = plausible(input.min) ? input.min : null;
  let max = plausible(input.max) ? input.max : null;
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  if (min === null && max === null) {
    return { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null };
  }
  return { salaryMin: min, salaryMax: max, salaryCurrency: currency, salaryPeriod: period };
}

/** Maps "1 YEAR", "per-year-salary", "YEAR", "monthly"… to a salary period. */
export function parseSalaryPeriod(value: string | null | undefined): DbEnum<"salary_period"> | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v.includes("year") || v.includes("annual")) return "year";
  if (v.includes("month")) return "month";
  if (v.includes("hour")) return "hour";
  if (v.includes("day") || v.includes("daily")) return "day";
  return null;
}

/** ISO-8601 with offset, or null. Accepts ISO strings and epoch milliseconds. */
export function toIsoDate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * True when any keyword appears in the title or tags as a whole token
 * ("ios" matches "Senior iOS Engineer", not "Studios"). Empty keywords match everything.
 */
export function matchesKeywords(job: { title: string; tags: string[] }, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const haystack = ` ${fold([job.title, ...job.tags].join(" "))} `;
  return keywords.some((keyword) => {
    const needle = fold(keyword);
    if (!needle) return false;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(haystack);
  });
}
