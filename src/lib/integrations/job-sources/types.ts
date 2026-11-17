import { z } from "zod";
import { EMPLOYMENT_TYPES, REMOTE_TYPES, SALARY_PERIODS } from "@/config/labels";

/**
 * A job after normalization — the only shape ingestion accepts.
 * Every connector maps its raw payload to this and nothing else.
 */
export const normalizedJobSchema = z.object({
  externalId: z.string().max(200).nullable(),
  url: z.url().max(2000),
  title: z.string().min(1).max(300),
  company: z.string().min(1).max(200),
  location: z.string().max(300).nullable(),
  remoteType: z.enum(REMOTE_TYPES),
  employmentType: z.enum(EMPLOYMENT_TYPES).nullable(),
  salaryMin: z.number().nonnegative().nullable(),
  salaryMax: z.number().nonnegative().nullable(),
  salaryCurrency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  salaryPeriod: z.enum(SALARY_PERIODS).nullable(),
  description: z.string().max(20_000).nullable(),
  postedAt: z.iso.datetime({ offset: true }).nullable(),
  /** Source-provided keywords (e.g. Remote OK tags), used only for keyword filtering. */
  tags: z.array(z.string()),
});
export type NormalizedJob = z.infer<typeof normalizedJobSchema>;

/** Settings stored in `job_sources.config` (non-secret). */
export const companyBoardConfigSchema = z.object({
  /** Board tokens, e.g. "gitlab" in boards.greenhouse.io/gitlab. */
  companies: z
    .array(z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/, "Use the board name from the URL."))
    .min(1, "Add at least one company board.")
    .max(25, "Up to 25 companies per source."),
  /** Optional: only keep jobs whose title matches one of these. Empty keeps all. */
  keywords: z.array(z.string().trim().min(1).max(60)).max(30),
});
export type CompanyBoardConfig = z.infer<typeof companyBoardConfigSchema>;

export const keywordFeedConfigSchema = z.object({
  /** Required: a feed of all remote jobs is too broad to import unfiltered. */
  keywords: z.array(z.string().trim().min(1).max(60)).min(1, "Add at least one keyword.").max(30),
});
export type KeywordFeedConfig = z.infer<typeof keywordFeedConfigSchema>;

export interface FetchResult {
  jobs: NormalizedJob[];
  /** Non-fatal problems, e.g. one company board not found. */
  warnings: string[];
}

/** Thrown for failures the user should see (bad board name, source unavailable). */
export class ConnectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorError";
  }
}
