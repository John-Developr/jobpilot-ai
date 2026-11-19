import "server-only";
import type { AuthenticatedContext } from "@/server/auth";
import { RepositoryError, throwRpcError } from "@/server/errors";
import type { DbEnum, Tables, Views } from "@/types/database";

export type ApplicationStatus = DbEnum<"application_status">;

/** Statuses shown in the queue, in workflow order. */
export const QUEUE_STATUSES = ["pending_approval", "approved", "scheduled", "applying", "failed"] as const;

export interface QueueItem {
  applicationId: string;
  jobId: string;
  title: string;
  company: string;
  url: string;
  status: ApplicationStatus;
  score: number | null;
  qualification: DbEnum<"qualification_level"> | null;
  priority: number;
  approvedAt: string | null;
  scheduledFor: string | null;
  submittedAt: string | null;
  submissionMethod: DbEnum<"submission_method"> | null;
  attemptCount: number;
  lastError: string | null;
}

export interface ApplicationEvent {
  id: string;
  applicationId: string;
  title: string | null;
  company: string | null;
  eventType: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus | null;
  actor: DbEnum<"event_actor">;
  message: string | null;
  createdAt: string;
}

const APPLICATION_COLUMNS =
  "id, job_id, status, priority, approved_at, scheduled_for, submitted_at, submission_method, attempt_count, last_error";

type ApplicationColumns = Pick<
  Tables<"applications">,
  | "id"
  | "job_id"
  | "status"
  | "priority"
  | "approved_at"
  | "scheduled_for"
  | "submitted_at"
  | "submission_method"
  | "attempt_count"
  | "last_error"
>;

async function listingsByApplication(
  { supabase, userId }: AuthenticatedContext,
  applicationIds: string[],
): Promise<Map<string, Views<"job_listings">>> {
  if (applicationIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("job_listings")
    .select("*")
    .eq("user_id", userId)
    .in("application_id", applicationIds);
  if (error) throw new RepositoryError("Failed to load job listings", { cause: error });
  return new Map(data.map((row) => [row.application_id, row]));
}

async function withJobs(ctx: AuthenticatedContext, rows: ApplicationColumns[]): Promise<QueueItem[]> {
  const listings = await listingsByApplication(
    ctx,
    rows.map((row) => row.id),
  );
  return rows.flatMap((row) => {
    const job = listings.get(row.id);
    if (!job) return [];
    return [
      {
        applicationId: row.id,
        jobId: row.job_id,
        title: job.title,
        company: job.company,
        url: job.url,
        status: row.status,
        score: job.overall_score,
        qualification: job.qualification,
        priority: row.priority,
        approvedAt: row.approved_at,
        scheduledFor: row.scheduled_for,
        submittedAt: row.submitted_at,
        submissionMethod: row.submission_method,
        attemptCount: row.attempt_count,
        lastError: row.last_error,
      },
    ];
  });
}

/** Applications waiting for approval, queued, being submitted or failed — in claim order. */
export async function listQueue(ctx: AuthenticatedContext): Promise<QueueItem[]> {
  const { data, error } = await ctx.supabase
    .from("applications")
    .select(APPLICATION_COLUMNS)
    .eq("user_id", ctx.userId)
    .in("status", [...QUEUE_STATUSES])
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new RepositoryError("Failed to load the application queue", { cause: error });
  return withJobs(ctx, data);
}

export async function listRecentlyApplied(ctx: AuthenticatedContext, limit = 10): Promise<QueueItem[]> {
  const { data, error } = await ctx.supabase
    .from("applications")
    .select(APPLICATION_COLUMNS)
    .eq("user_id", ctx.userId)
    .eq("status", "applied")
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new RepositoryError("Failed to load submitted applications", { cause: error });
  return withJobs(ctx, data);
}

/** Submissions (manual and automated) recorded between `start` and `end`. */
export async function countSubmitted(
  { supabase, userId }: AuthenticatedContext,
  bounds: { start: Date; end: Date },
): Promise<number> {
  const { count, error } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("submitted_at", bounds.start.toISOString())
    .lt("submitted_at", bounds.end.toISOString());
  if (error) throw new RepositoryError("Failed to count submissions", { cause: error });
  return count ?? 0;
}

/** Latest application events (the audit log), newest first. */
export async function listRecentEvents(ctx: AuthenticatedContext, limit = 20): Promise<ApplicationEvent[]> {
  const { data, error } = await ctx.supabase
    .from("application_events")
    .select("id, application_id, event_type, from_status, to_status, actor, message, created_at")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new RepositoryError("Failed to load application activity", { cause: error });
  const listings = await listingsByApplication(ctx, [...new Set(data.map((row) => row.application_id))]);
  return data.map((row) => {
    const job = listings.get(row.application_id);
    return {
      id: row.id,
      applicationId: row.application_id,
      title: job?.title ?? null,
      company: job?.company ?? null,
      eventType: row.event_type,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      actor: row.actor,
      message: row.message,
      createdAt: row.created_at,
    };
  });
}

export async function approveApplication(
  { supabase }: AuthenticatedContext,
  applicationId: string,
  submitAfter: Date | null,
): Promise<ApplicationStatus> {
  const { data, error } = await supabase.rpc("approve_application", {
    p_application_id: applicationId,
    p_submit_after: submitAfter?.toISOString() ?? null,
  });
  if (error) throwRpcError("approve application", error);
  return data;
}

export async function withdrawApproval({ supabase }: AuthenticatedContext, applicationId: string): Promise<ApplicationStatus> {
  const { data, error } = await supabase.rpc("withdraw_approval", { p_application_id: applicationId });
  if (error) throwRpcError("withdraw approval", error);
  return data;
}

export async function markApplicationSubmitted(
  { supabase }: AuthenticatedContext,
  applicationId: string,
): Promise<ApplicationStatus> {
  const { data, error } = await supabase.rpc("mark_application_submitted", { p_application_id: applicationId });
  if (error) throwRpcError("mark application as applied", error);
  return data;
}
