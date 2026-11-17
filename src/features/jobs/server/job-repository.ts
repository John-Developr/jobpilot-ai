import "server-only";
import { createHash } from "node:crypto";
import type { AuthenticatedContext } from "@/server/auth";
import { assertMutation, RepositoryError, UserFacingError } from "@/server/errors";
import type { Views } from "@/types/database";
import { canonicalUrl, fingerprintSource } from "@/lib/integrations/job-sources/normalize";
import type { NormalizedJob } from "@/lib/integrations/job-sources/types";
import { JOBS_PAGE_SIZE, sanitizeSearchTerm, type JobFilters } from "../schemas";

export type JobListing = Views<"job_listings">;
export interface JobDetail extends JobListing {
  description: string | null;
  externalId: string | null;
}

const PRE_SUBMISSION = ["discovered", "analyzing", "qualified", "drafting", "pending_approval"] as const;

export async function listJobs(
  { supabase, userId }: AuthenticatedContext,
  filters: JobFilters,
): Promise<{ items: JobListing[]; total: number }> {
  let query = supabase.from("job_listings").select("*", { count: "exact" }).eq("user_id", userId);

  const q = sanitizeSearchTerm(filters.q);
  if (q) query = query.or(`title.ilike."%${q}%",company.ilike."%${q}%"`);
  const location = sanitizeSearchTerm(filters.location);
  if (location) query = query.ilike("location", `%${location}%`);
  if (filters.remote) query = query.eq("remote_type", filters.remote);
  if (filters.type) query = query.eq("employment_type", filters.type);
  if (filters.source) query = query.eq("source_key", filters.source);
  if (filters.minSalary !== null) query = query.gte("salary_upper", filters.minSalary);
  if (filters.status === "active") query = query.neq("status", "archived");
  if (filters.status === "archived") query = query.eq("status", "archived");
  if (filters.level === "unscored") query = query.is("overall_score", null);
  else if (filters.level) query = query.eq("qualification", filters.level);
  if (filters.sort === "score") query = query.order("overall_score", { ascending: false, nullsFirst: false });

  const from = (filters.page - 1) * JOBS_PAGE_SIZE;
  const { data, error, count } = await query
    .order("discovered_at", { ascending: false })
    .order("id")
    .range(from, from + JOBS_PAGE_SIZE - 1);
  if (error) throw new RepositoryError("Failed to load jobs", { cause: error });
  return { items: data, total: count ?? 0 };
}

export async function getJob({ supabase, userId }: AuthenticatedContext, id: string): Promise<JobDetail | null> {
  const [listing, job] = await Promise.all([
    supabase.from("job_listings").select("*").eq("user_id", userId).eq("id", id).maybeSingle(),
    supabase.from("jobs").select("description, external_id").eq("user_id", userId).eq("id", id).maybeSingle(),
  ]);
  if (listing.error) throw new RepositoryError("Failed to load job", { cause: listing.error });
  if (job.error) throw new RepositoryError("Failed to load job", { cause: job.error });
  if (!listing.data || !job.data) return null;
  return { ...listing.data, description: job.data.description, externalId: job.data.external_id };
}

export interface JobStats {
  total: number;
  active: number;
  discoveredThisWeek: number;
  archived: number;
  qualified: number;
  unscored: number;
}

export async function getJobStats({ supabase, userId }: AuthenticatedContext, now: Date): Promise<JobStats> {
  const base = () => supabase.from("job_listings").select("id", { count: "exact", head: true }).eq("user_id", userId);
  const count = async (apply: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const { count: n, error } = await apply(base());
    if (error) throw new RepositoryError("Failed to count jobs", { cause: error });
    return n ?? 0;
  };
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [total, archived, discoveredThisWeek, qualified, unscored] = await Promise.all([
    count((q) => q),
    count((q) => q.eq("status", "archived")),
    count((q) => q.gte("discovered_at", weekAgo)),
    count((q) => q.eq("status", "qualified")),
    count((q) => q.is("overall_score", null).neq("status", "archived")),
  ]);
  return { total, active: total - archived, discoveredThisWeek, archived, qualified, unscored };
}

/** Hashes are computed here (server) so every source shares one definition of "duplicate". */
function toIngestRow(job: NormalizedJob) {
  return {
    external_id: job.externalId,
    url: canonicalUrl(job.url),
    dedupe_hash: createHash("sha256").update(fingerprintSource(job)).digest("hex"),
    title: job.title,
    company: job.company,
    location: job.location,
    remote_type: job.remoteType,
    employment_type: job.employmentType,
    salary_min: job.salaryMin,
    salary_max: job.salaryMax,
    salary_currency: job.salaryCurrency,
    salary_period: job.salaryPeriod,
    description: job.description,
    posted_at: job.postedAt,
  };
}

export async function ingestJobs(
  { supabase }: AuthenticatedContext,
  sourceId: string,
  jobs: NormalizedJob[],
): Promise<{ inserted: number; skipped: number }> {
  if (jobs.length === 0) return { inserted: 0, skipped: 0 };
  const { data, error } = await supabase.rpc("ingest_jobs", {
    p_source_id: sourceId,
    p_jobs: jobs.map(toIngestRow),
  });
  if (error) throw new RepositoryError("Failed to ingest jobs", { cause: error });
  const row = data[0];
  return { inserted: row?.inserted_count ?? 0, skipped: row?.skipped_count ?? 0 };
}

export async function findJobIdByUrl({ supabase, userId }: AuthenticatedContext, url: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("jobs")
    .select("id")
    .eq("user_id", userId)
    .eq("url", canonicalUrl(url))
    .maybeSingle();
  if (error) throw new RepositoryError("Failed to look up job", { cause: error });
  return data?.id ?? null;
}

export async function setJobArchived({ supabase }: AuthenticatedContext, jobId: string, archived: boolean) {
  const { error } = await supabase.rpc("set_job_archived", { p_job_id: jobId, p_archived: archived });
  if (error?.code === "P0002") throw new UserFacingError("This job no longer exists. Refresh the page.");
  if (error?.code === "22023") throw new UserFacingError("Jobs that are approved or submitted cannot be archived.");
  assertMutation("archive job", error);
}

/** Deletes a job before it reaches approval; its pipeline row and events cascade. */
export async function deleteJob(ctx: AuthenticatedContext, jobId: string): Promise<void> {
  const job = await getJob(ctx, jobId);
  if (!job) throw new UserFacingError("This job no longer exists. Refresh the page.");
  if (!(PRE_SUBMISSION as readonly string[]).includes(job.status) && job.status !== "archived") {
    throw new UserFacingError("Jobs with an approved or submitted application cannot be deleted.");
  }
  const { data, error } = await ctx.supabase
    .from("jobs")
    .delete()
    .eq("id", jobId)
    .eq("user_id", ctx.userId)
    .select("id");
  assertMutation("delete job", error, { affected: data });
}
