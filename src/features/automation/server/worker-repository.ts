import "server-only";
import type { AuthenticatedContext } from "@/server/auth";
import { RepositoryError, throwRpcError } from "@/server/errors";
import type { DbEnum, Json } from "@/types/database";
import { AUTOMATED_CONNECTOR_KEYS } from "@/lib/integrations/job-sources/catalog";

/**
 * Data access for background workers (secret-key client). Every query filters by the
 * context's user id; the worker contract functions are service-role only in the database.
 */

type Client = AuthenticatedContext["supabase"];

export interface Claim {
  applicationId: string;
  lockToken: string;
  runId: string;
  attempt: number;
}

export interface DueCandidate {
  applicationId: string;
  jobUrl: string;
}

const distinct = (ids: string[]) => [...new Set(ids)];

/** Users with automation switched on (paused ones too: the claim still clears stale runs). */
export async function listAutomationUsers(supabase: Client): Promise<string[]> {
  const { data, error } = await supabase.from("automation_settings").select("user_id").eq("is_enabled", true);
  if (error) throw new RepositoryError("Failed to list automation users", { cause: error });
  return distinct(data.map((row) => row.user_id));
}

/** Users with at least one enabled automated job source. */
export async function listDiscoveryUsers(supabase: Client): Promise<string[]> {
  const { data, error } = await supabase
    .from("job_sources")
    .select("user_id")
    .eq("is_enabled", true)
    .in("connector_key", [...AUTOMATED_CONNECTOR_KEYS]);
  if (error) throw new RepositoryError("Failed to list discovery users", { cause: error });
  return distinct(data.map((row) => row.user_id));
}

export async function listEnabledSources(
  { supabase, userId }: AuthenticatedContext,
): Promise<{ id: string; connectorKey: string }[]> {
  const { data, error } = await supabase
    .from("job_sources")
    .select("id, connector_key")
    .eq("user_id", userId)
    .eq("is_enabled", true)
    .in("connector_key", [...AUTOMATED_CONNECTOR_KEYS]);
  if (error) throw new RepositoryError("Failed to list job sources", { cause: error });
  return data.map((row) => ({ id: row.id, connectorKey: row.connector_key }));
}

/** Approved or scheduled applications whose earliest submit time has passed, with their job URL. */
export async function listDueCandidates({ supabase, userId }: AuthenticatedContext, now: Date): Promise<DueCandidate[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("id, job_id")
    .eq("user_id", userId)
    .in("status", ["approved", "scheduled"])
    .or(`scheduled_for.is.null,scheduled_for.lte.${now.toISOString()}`)
    .limit(200);
  if (error) throw new RepositoryError("Failed to list due applications", { cause: error });
  if (data.length === 0) return [];
  const jobs = await supabase
    .from("jobs")
    .select("id, url")
    .eq("user_id", userId)
    .in("id", distinct(data.map((row) => row.job_id)));
  if (jobs.error) throw new RepositoryError("Failed to load job URLs", { cause: jobs.error });
  const urls = new Map(jobs.data.map((job) => [job.id, job.url]));
  return data.flatMap((row) => {
    const jobUrl = urls.get(row.job_id);
    return jobUrl ? [{ applicationId: row.id, jobUrl }] : [];
  });
}

export async function getApplicationJobUrl({ supabase, userId }: AuthenticatedContext, applicationId: string): Promise<string | null> {
  const app = await supabase.from("applications").select("job_id").eq("user_id", userId).eq("id", applicationId).maybeSingle();
  if (app.error) throw new RepositoryError("Failed to load application", { cause: app.error });
  if (!app.data) return null;
  const job = await supabase.from("jobs").select("url").eq("user_id", userId).eq("id", app.data.job_id).maybeSingle();
  if (job.error) throw new RepositoryError("Failed to load job", { cause: job.error });
  return job.data?.url ?? null;
}

export async function claimNext(
  { supabase, userId }: AuthenticatedContext,
  day: { start: Date; end: Date },
  candidateIds: string[],
): Promise<Claim | null> {
  const { data, error } = await supabase.rpc("claim_next_application", {
    p_user_id: userId,
    p_day_start: day.start.toISOString(),
    p_day_end: day.end.toISOString(),
    p_candidates: candidateIds,
  });
  if (error) throwRpcError("claim application", error);
  const row = data[0];
  return row ? { applicationId: row.application_id, lockToken: row.lock_token, runId: row.run_id, attempt: row.attempt } : null;
}

export async function releaseClaim(
  { supabase }: AuthenticatedContext,
  claim: Claim,
  submitAfter: Date | null,
  reason: string,
): Promise<DbEnum<"application_status">> {
  const { data, error } = await supabase.rpc("release_application_claim", {
    p_application_id: claim.applicationId,
    p_lock_token: claim.lockToken,
    p_submit_after: submitAfter?.toISOString() ?? null,
    p_reason: reason,
  });
  if (error) throwRpcError("release claim", error);
  return data;
}

export async function failAttempt(
  { supabase }: AuthenticatedContext,
  claim: Claim,
  failure: { code: string; message: string; retryable: boolean },
): Promise<DbEnum<"application_status">> {
  const { data, error } = await supabase.rpc("fail_application_attempt", {
    p_application_id: claim.applicationId,
    p_lock_token: claim.lockToken,
    p_error_code: failure.code,
    p_error_message: failure.message,
    p_retryable: failure.retryable,
  });
  if (error) throwRpcError("record failed attempt", error);
  return data;
}

export async function completeSubmission(
  { supabase }: AuthenticatedContext,
  claim: Claim,
  evidence: Record<string, string>,
): Promise<DbEnum<"application_status">> {
  const { data, error } = await supabase.rpc("complete_application_submission", {
    p_application_id: claim.applicationId,
    p_lock_token: claim.lockToken,
    p_evidence: evidence satisfies Json,
  });
  if (error) throwRpcError("record submission", error);
  return data;
}

/** Links an automation run to its Trigger.dev run for cross-referencing logs. */
export async function setExternalRunId({ supabase, userId }: AuthenticatedContext, runId: string, externalRunId: string) {
  const { error } = await supabase
    .from("automation_runs")
    .update({ external_run_id: externalRunId })
    .eq("id", runId)
    .eq("user_id", userId);
  if (error) throw new RepositoryError("Failed to link automation run", { cause: error });
}

/** Starts a discovery run; returns null when this schedule tick already ran for the source. */
export async function startDiscoveryRun(
  { supabase, userId }: AuthenticatedContext,
  input: { sourceId: string; idempotencyKey: string; externalRunId: string | null },
): Promise<string | null> {
  const { data, error } = await supabase
    .from("automation_runs")
    .insert({
      user_id: userId,
      kind: "discovery",
      status: "running",
      job_source_id: input.sourceId,
      idempotency_key: input.idempotencyKey,
      external_run_id: input.externalRunId,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error?.code === "23505") return null;
  if (error) throw new RepositoryError("Failed to start discovery run", { cause: error });
  return data.id;
}

export async function finishRun(
  { supabase, userId }: AuthenticatedContext,
  runId: string,
  result: { status: "succeeded" | "failed"; message: string | null; errorCode?: string },
) {
  const { error } = await supabase
    .from("automation_runs")
    .update({
      status: result.status,
      finished_at: new Date().toISOString(),
      error_code: result.status === "failed" ? (result.errorCode ?? "error") : null,
      error_message: result.status === "failed" ? result.message : null,
      log: result.message ? [{ at: new Date().toISOString(), level: "info", message: result.message }] : [],
    })
    .eq("id", runId)
    .eq("user_id", userId);
  if (error) throw new RepositoryError("Failed to finish automation run", { cause: error });
}
