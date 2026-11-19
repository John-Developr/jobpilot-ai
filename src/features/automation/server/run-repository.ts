import "server-only";
import type { AuthenticatedContext } from "@/server/auth";
import { RepositoryError } from "@/server/errors";
import type { DbEnum, Json } from "@/types/database";

export interface AutomationRun {
  id: string;
  kind: DbEnum<"run_kind">;
  status: DbEnum<"run_status">;
  /** Source name for discovery, job title for submissions. */
  target: string | null;
  applicationId: string | null;
  attempt: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  /** Last log message, if any. */
  summary: string | null;
  createdAt: string;
}

function lastMessage(log: Json): string | null {
  if (!Array.isArray(log)) return null;
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const entry = log[i];
    if (entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.message === "string") return entry.message;
  }
  return null;
}

/** Latest background runs (discovery and submissions), newest first. Owner-only via RLS. */
export async function listRuns({ supabase, userId }: AuthenticatedContext, limit = 50): Promise<AutomationRun[]> {
  const { data, error } = await supabase
    .from("automation_runs")
    .select("id, kind, status, application_id, job_source_id, attempt, started_at, finished_at, error_message, log, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new RepositoryError("Failed to load automation runs", { cause: error });

  const sourceIds = [...new Set(data.flatMap((run) => (run.job_source_id ? [run.job_source_id] : [])))];
  const applicationIds = [...new Set(data.flatMap((run) => (run.application_id ? [run.application_id] : [])))];
  const [sources, listings] = await Promise.all([
    sourceIds.length
      ? supabase.from("job_sources").select("id, name").eq("user_id", userId).in("id", sourceIds)
      : Promise.resolve({ data: [], error: null }),
    applicationIds.length
      ? supabase.from("job_listings").select("application_id, title, company").eq("user_id", userId).in("application_id", applicationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sources.error) throw new RepositoryError("Failed to load job sources", { cause: sources.error });
  if (listings.error) throw new RepositoryError("Failed to load job listings", { cause: listings.error });
  const sourceNames = new Map(sources.data.map((source) => [source.id, source.name]));
  const jobNames = new Map(listings.data.map((job) => [job.application_id, `${job.title}, ${job.company}`]));

  return data.map((run) => ({
    id: run.id,
    kind: run.kind,
    status: run.status,
    target:
      (run.job_source_id ? sourceNames.get(run.job_source_id) : undefined) ??
      (run.application_id ? jobNames.get(run.application_id) : undefined) ??
      null,
    applicationId: run.application_id,
    attempt: run.attempt,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    errorMessage: run.error_message,
    summary: lastMessage(run.log),
    createdAt: run.created_at,
  }));
}
