import "server-only";
import type { AuthenticatedContext } from "@/server/auth";
import { UserFacingError } from "@/server/errors";
import { logger } from "@/lib/monitoring/logger";
import {
  JOB_SOURCE_CATALOG,
  MAX_JOBS_PER_SYNC,
  SYNC_COOLDOWN_MINUTES,
  type AutomatedConnectorKey,
} from "@/lib/integrations/job-sources/catalog";
import { extractJobPosting, type JobPostingDraft } from "@/lib/integrations/job-sources/json-ld";
import { canonicalUrl, cleanText, matchesKeywords, sanitizeSalary } from "@/lib/integrations/job-sources/normalize";
import { runConnector } from "@/lib/integrations/job-sources/registry";
import { ConnectorError, normalizedJobSchema, type NormalizedJob } from "@/lib/integrations/job-sources/types";
import { fetchPublicHtml, SafeFetchError } from "@/lib/integrations/safe-fetch";
import type { ManualJobInput } from "../schemas";
import { findJobIdByUrl, ingestJobs } from "./job-repository";
import { ensureManualSource, getSourceRow, recordSync } from "./source-repository";

export interface SyncSummary {
  fetched: number;
  matched: number;
  inserted: number;
  skipped: number;
  warnings: string[];
}

/** Keeps valid, keyword-matching jobs, newest first, capped per sync. */
export function selectJobsForIngest(
  jobs: NormalizedJob[],
  keywords: string[],
): { selected: NormalizedJob[]; invalid: number } {
  let invalid = 0;
  const valid: NormalizedJob[] = [];
  for (const job of jobs) {
    if (!matchesKeywords(job, keywords)) continue;
    let url: string;
    try {
      url = canonicalUrl(job.url);
    } catch {
      invalid += 1;
      continue;
    }
    const parsed = normalizedJobSchema.safeParse({ ...job, url });
    if (parsed.success) valid.push(parsed.data);
    else invalid += 1;
  }
  valid.sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
  return { selected: valid.slice(0, MAX_JOBS_PER_SYNC), invalid };
}

/**
 * Runs one source now. Synchronous for Phase 3 (a few HTTP calls); moves to a
 * Trigger.dev task in Phase 7 with the same steps.
 */
export async function syncSource(ctx: AuthenticatedContext, key: AutomatedConnectorKey, now: Date): Promise<SyncSummary> {
  const source = await getSourceRow(ctx, key);
  if (!source) throw new UserFacingError("Save this source's settings before syncing.");
  if (!source.is_enabled) throw new UserFacingError("Enable this source before syncing.");
  if (source.last_synced_at) {
    const minutes = (now.getTime() - new Date(source.last_synced_at).getTime()) / 60_000;
    if (minutes < SYNC_COOLDOWN_MINUTES) {
      throw new UserFacingError(
        `${JOB_SOURCE_CATALOG[key].name} was synced ${Math.floor(minutes)} min ago. Wait ${Math.ceil(SYNC_COOLDOWN_MINUTES - minutes)} min to sync again.`,
      );
    }
  }

  let fetched: Awaited<ReturnType<typeof runConnector>>;
  try {
    fetched = await runConnector(key, source.config);
  } catch (error) {
    if (error instanceof ConnectorError) {
      await recordSync(ctx, source.id, { succeeded: false, message: error.message });
      throw new UserFacingError(error.message);
    }
    throw error;
  }

  const { selected, invalid } = selectJobsForIngest(fetched.jobs, fetched.keywords);
  const warnings = [...fetched.warnings];
  if (invalid > 0) warnings.push(`Skipped ${invalid} listing(s) with missing or invalid fields.`);

  const { inserted, skipped } = await ingestJobs(ctx, source.id, selected);
  await recordSync(ctx, source.id, { succeeded: true, message: warnings.length ? warnings.join(" ") : null });

  logger.info("jobs.sync.completed", {
    userId: ctx.userId,
    source: key,
    fetched: fetched.jobs.length,
    matched: selected.length,
    inserted,
    skipped,
  });
  return { fetched: fetched.jobs.length, matched: selected.length, inserted, skipped, warnings };
}

/** Adds one job typed or pasted by the user. Returns the new job's id. */
export async function addManualJob(ctx: AuthenticatedContext, input: ManualJobInput): Promise<string> {
  const job: NormalizedJob = {
    externalId: null,
    url: canonicalUrl(input.url),
    title: input.title,
    company: input.company,
    location: cleanText(input.location),
    remoteType: input.remoteType,
    employmentType: input.employmentType || null,
    ...sanitizeSalary({
      min: input.salaryMin,
      max: input.salaryMax,
      currency: input.salaryCurrency || null,
      period: input.salaryPeriod || null,
    }),
    description: input.description || null,
    postedAt: null,
    tags: [],
  };
  const sourceId = await ensureManualSource(ctx);
  const { inserted } = await ingestJobs(ctx, sourceId, [job]);
  const id = await findJobIdByUrl(ctx, job.url);
  if (inserted === 0) {
    throw new UserFacingError(
      id ? "This job is already in your list." : "A job with the same title, company and location is already in your list.",
    );
  }
  if (!id) throw new UserFacingError("The job was saved but could not be found. Refresh the page.");
  return id;
}

/** Sites whose terms prohibit automated access; their pages are never fetched. */
const NO_AUTOMATION_HOSTS = /(^|\.)(linkedin\.com|indeed\.[a-z.]+|jobstreet\.[a-z.]+|seek\.com\.au|glassdoor\.[a-z.]+)$/i;

export async function prefillFromUrl(rawUrl: string): Promise<JobPostingDraft & { url: string }> {
  const host = new URL(rawUrl).hostname;
  if (NO_AUTOMATION_HOSTS.test(host)) {
    throw new UserFacingError(
      "This site does not allow automated access, so JobPilot will not fetch it. Copy the job details in manually.",
    );
  }
  let page: { url: string; html: string };
  try {
    page = await fetchPublicHtml(rawUrl);
  } catch (error) {
    if (error instanceof SafeFetchError) throw new UserFacingError(error.message);
    throw error;
  }
  const draft = extractJobPosting(page.html);
  if (!draft) {
    throw new UserFacingError("No structured job details were found on that page. Fill in the fields manually.");
  }
  return { ...draft, url: rawUrl };
}
