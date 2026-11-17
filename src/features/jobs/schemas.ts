import { z } from "zod";
import { EMPLOYMENT_TYPES, REMOTE_TYPES, SALARY_PERIODS } from "@/config/labels";
import { AUTOMATED_CONNECTOR_KEYS, JOB_SOURCE_CATALOG } from "@/lib/integrations/job-sources/catalog";

export const JOBS_PAGE_SIZE = 25;

const CONNECTOR_KEYS = Object.keys(JOB_SOURCE_CATALOG) as [keyof typeof JOB_SOURCE_CATALOG, ...(keyof typeof JOB_SOURCE_CATALOG)[]];

/**
 * Jobs list filters from the URL. Lenient: an invalid parameter falls back to its
 * default instead of failing the page (URLs are user-editable).
 */
export const jobFiltersSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  location: z.string().trim().max(100).catch(""),
  remote: z.union([z.literal(""), z.enum(REMOTE_TYPES)]).catch(""),
  type: z.union([z.literal(""), z.enum(EMPLOYMENT_TYPES)]).catch(""),
  source: z.union([z.literal(""), z.enum(CONNECTOR_KEYS)]).catch(""),
  minSalary: z.coerce.number().int().positive().max(1_000_000_000).nullable().catch(null),
  status: z.enum(["active", "archived", "all"]).catch("active"),
  level: z.enum(["", "high_priority", "recommended", "manual_review", "archive", "unscored"]).catch(""),
  sort: z.enum(["newest", "score"]).catch("newest"),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});
export type JobFilters = z.infer<typeof jobFiltersSchema>;

/** Reads filters from Next.js searchParams (string | string[] | undefined values). */
export function parseJobFilters(params: Record<string, string | string[] | undefined>): JobFilters {
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  return jobFiltersSchema.parse({
    q: first("q") ?? "",
    location: first("location") ?? "",
    remote: first("remote") ?? "",
    type: first("type") ?? "",
    source: first("source") ?? "",
    minSalary: first("minSalary") || null,
    status: first("status") ?? "active",
    level: first("level") ?? "",
    sort: first("sort") ?? "newest",
    page: first("page") ?? 1,
  });
}

/**
 * Free-text search terms are reduced to a safe character set before reaching a
 * PostgREST filter string (no commas, parentheses, quotes or wildcards).
 */
export function sanitizeSearchTerm(value: string): string {
  return value
    .replace(/[^\p{L}\p{N}\s.+#&'/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

const text = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters.`);
const requiredText = (max: number) => text(max).min(1, "Required.");
const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .regex(/^https?:\/\/[^\s]+\.[^\s]+$/i, "Enter the full job URL starting with https://");

export const manualJobSchema = z
  .object({
    url: httpsUrl,
    title: requiredText(300),
    company: requiredText(200),
    location: text(300),
    remoteType: z.enum(REMOTE_TYPES),
    employmentType: z.union([z.literal(""), z.enum(EMPLOYMENT_TYPES)]),
    salaryMin: z.number({ error: "Enter a number." }).nonnegative().max(1_000_000_000).nullable(),
    salaryMax: z.number({ error: "Enter a number." }).nonnegative().max(1_000_000_000).nullable(),
    salaryCurrency: z.union([z.literal(""), z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter code, e.g. USD.")]),
    salaryPeriod: z.union([z.literal(""), z.enum(SALARY_PERIODS)]),
    description: text(20_000),
  })
  .refine((v) => v.salaryMin === null || v.salaryMax === null || v.salaryMin <= v.salaryMax, {
    path: ["salaryMax"],
    message: "Maximum must be at least the minimum.",
  })
  .refine((v) => (v.salaryMin === null && v.salaryMax === null) || (v.salaryCurrency !== "" && v.salaryPeriod !== ""), {
    path: ["salaryPeriod"],
    message: "Add the currency and period for the salary.",
  });
export type ManualJobInput = z.infer<typeof manualJobSchema>;

export const prefillSchema = z.object({ url: httpsUrl });

export const jobIdSchema = z.object({ jobId: z.uuid() });
export const archiveJobSchema = z.object({ jobId: z.uuid(), archived: z.boolean() });

export const sourceKeySchema = z.object({ key: z.enum(AUTOMATED_CONNECTOR_KEYS) });

/** Config is validated by the connector's own schema in the service. */
export const saveSourceSchema = z.object({
  key: z.enum(AUTOMATED_CONNECTOR_KEYS),
  isEnabled: z.boolean(),
  config: z.object({
    companies: z.array(z.string()).optional(),
    keywords: z.array(z.string()),
  }),
});
export type SaveSourceInput = z.infer<typeof saveSourceSchema>;
