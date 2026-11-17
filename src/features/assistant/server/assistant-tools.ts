import "server-only";
import { z } from "zod";
import { defineTool, type AiTool } from "@/lib/ai/run-structured";
import type { AuthenticatedContext } from "@/server/auth";
import { RepositoryError } from "@/server/errors";
import { evaluateSubmissionWindow, localDayBounds } from "@/lib/scheduling/submission-window";
import { EMPLOYMENT_TYPES, REMOTE_TYPES } from "@/config/labels";
import { getAutomationSettings, type AutomationSettings } from "@/features/settings/server/automation-settings-repository";
import { getJobStats, type JobListing } from "@/features/jobs/server/job-repository";
import { sanitizeSearchTerm } from "@/features/jobs/schemas";
import { formatDateTime, formatSalary } from "@/features/jobs/format";
import { getProfileCompleteness } from "@/features/profile/server/profile-repository";
import { getLatestEvaluation } from "@/features/evaluation/server/evaluation-repository";
import { loadCandidateContext } from "@/features/evaluation/server/candidate-context";
import type { DbEnum } from "@/types/database";

/*
 * Read-only tools for Ask JobPilot. Every query runs as the signed-in user (RLS) and
 * filters by user_id. No tool writes, and none return contact details or secrets.
 */

const APPLICATION_STATUSES = [
  "discovered", "analyzing", "qualified", "drafting", "pending_approval", "approved", "scheduled", "applying",
  "applied", "failed", "interview", "assessment", "rejected", "withdrawn", "archived",
] as const satisfies readonly DbEnum<"application_status">[];
const QUALIFICATIONS = ["high_priority", "recommended", "manual_review", "archive"] as const satisfies readonly DbEnum<"qualification_level">[];

const MAX_DESCRIPTION_CHARS = 3000;

export function buildAssistantTools(ctx: AuthenticatedContext, now: Date): AiTool[] {
  const { supabase, userId } = ctx;
  let settingsPromise: Promise<AutomationSettings> | undefined;
  const settings = () => (settingsPromise ??= getAutomationSettings(ctx));
  const when = async (iso: string | null) => formatDateTime(iso, (await settings()).timezone);

  const jobSummary = async (row: JobListing) => ({
    id: row.id,
    application_id: row.application_id,
    title: row.title,
    company: row.company,
    location: row.location,
    remote: row.remote_type,
    employment: row.employment_type,
    salary: formatSalary(row.salary_min, row.salary_max, row.salary_currency, row.salary_period),
    status: row.status,
    match_score: row.overall_score,
    qualification: row.qualification,
    found: await when(row.discovered_at),
    source: row.source_name,
  });

  return [
    defineTool({
      name: "get_overview",
      description:
        "Overall status: job counts, applications per status, today's submissions vs the daily limit, whether the submission window is open now, automation and pause state, and profile completeness. Use for 'how is it going' questions.",
      parameters: z.object({}),
      execute: async () => {
        const s = await settings();
        const today = localDayBounds(now, s.timezone);
        const [jobs, statuses, submittedToday, profile] = await Promise.all([
          getJobStats(ctx, now),
          supabase.from("applications").select("status").eq("user_id", userId).limit(10_000),
          supabase
            .from("applications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .gte("submitted_at", today.start.toISOString())
            .lt("submitted_at", today.end.toISOString()),
          getProfileCompleteness(ctx),
        ]);
        if (statuses.error) throw new RepositoryError("Failed to count applications", { cause: statuses.error });
        if (submittedToday.error) throw new RepositoryError("Failed to count submissions", { cause: submittedToday.error });
        const byStatus: Record<string, number> = {};
        for (const row of statuses.data) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
        const window = evaluateSubmissionWindow(now, s);

        return {
          now: await when(now.toISOString()),
          jobs,
          applications_by_status: byStatus,
          submitted_today: submittedToday.count ?? 0,
          daily_limit: s.dailyApplicationLimit,
          automation: {
            enabled: s.isEnabled,
            paused: s.isPaused,
            paused_reason: s.pausedReason,
            min_match_score: s.minMatchScore,
            approval_required: s.requireApproval,
            working_days_iso: s.workingDays,
            window: `${s.windowStart}-${s.windowEnd} ${s.timezone} (end exclusive)`,
          },
          submission_window: window.open
            ? { open: true, closes: await when(window.windowEnd.toISOString()) }
            : { open: false, reason: window.reason, next_opens: await when(window.nextWindowStart?.toISOString() ?? null) },
          profile_completeness: profile,
          note: "Automated submission (queue, scheduling) is not built yet; applications are prepared in Application Studio.",
        };
      },
    }),

    defineTool({
      name: "search_jobs",
      description:
        "Find the user's saved jobs. Filter by text (title or company), application status, match level, remote type, minimum match score. Returns up to `limit` jobs plus the total that match.",
      parameters: z.object({
        text: z.string().max(100).nullable().describe("Words in the job title or company"),
        status: z.enum([...APPLICATION_STATUSES, "active"]).nullable().describe("'active' = everything not archived"),
        qualification: z.enum([...QUALIFICATIONS, "unscored"]).nullable(),
        remote: z.enum(REMOTE_TYPES).nullable(),
        employment: z.enum(EMPLOYMENT_TYPES).nullable(),
        min_score: z.number().int().min(0).max(100).nullable(),
        sort: z.enum(["newest", "best_match"]),
        limit: z.number().int().min(1).max(20),
      }),
      execute: async (args) => {
        let query = supabase.from("job_listings").select("*", { count: "exact" }).eq("user_id", userId);
        const text = sanitizeSearchTerm(args.text ?? "");
        if (text) query = query.or(`title.ilike."%${text}%",company.ilike."%${text}%"`);
        if (args.status === "active") query = query.neq("status", "archived");
        else if (args.status) query = query.eq("status", args.status);
        if (args.qualification === "unscored") query = query.is("overall_score", null);
        else if (args.qualification) query = query.eq("qualification", args.qualification);
        if (args.remote) query = query.eq("remote_type", args.remote);
        if (args.employment) query = query.eq("employment_type", args.employment);
        if (args.min_score !== null) query = query.gte("overall_score", args.min_score);
        if (args.sort === "best_match") query = query.order("overall_score", { ascending: false, nullsFirst: false });
        const { data, error, count } = await query.order("discovered_at", { ascending: false }).order("id").limit(args.limit);
        if (error) throw new RepositoryError("Failed to search jobs", { cause: error });
        return { total_matching: count ?? 0, jobs: await Promise.all(data.map(jobSummary)) };
      },
    }),

    defineTool({
      name: "get_job_details",
      description:
        "Full details for one job: description, latest match evaluation (criteria scores, matched and missing skills, gaps, explanation), application status and prepared documents. Accepts a job id or an application id.",
      parameters: z.object({ id: z.uuid().describe("Job id or application id") }),
      execute: async ({ id }) => {
        const { data: listing, error } = await supabase
          .from("job_listings")
          .select("*")
          .eq("user_id", userId)
          .or(`id.eq.${id},application_id.eq.${id}`)
          .maybeSingle();
        if (error) throw new RepositoryError("Failed to load job", { cause: error });
        if (!listing) return { error: "No job or application with that id." };

        const [job, evaluation, documents, answers] = await Promise.all([
          supabase.from("jobs").select("description, url").eq("user_id", userId).eq("id", listing.id).maybeSingle(),
          getLatestEvaluation(ctx, listing.id),
          supabase
            .from("application_documents")
            .select("kind, version, grounding_flags, created_at")
            .eq("user_id", userId)
            .eq("application_id", listing.application_id)
            .order("version", { ascending: false }),
          supabase
            .from("application_answers")
            .select("is_verified")
            .eq("user_id", userId)
            .eq("application_id", listing.application_id),
        ]);
        if (job.error) throw new RepositoryError("Failed to load job", { cause: job.error });
        if (documents.error) throw new RepositoryError("Failed to load documents", { cause: documents.error });
        if (answers.error) throw new RepositoryError("Failed to load answers", { cause: answers.error });

        const latestByKind = new Map<string, { latest_version: number; unresolved_flags: number; saved: string | null }>();
        for (const doc of documents.data) {
          if (!latestByKind.has(doc.kind)) {
            latestByKind.set(doc.kind, { latest_version: doc.version, unresolved_flags: doc.grounding_flags.length, saved: await when(doc.created_at) });
          }
        }
        const description = job.data?.description ?? null;

        return {
          ...(await jobSummary(listing)),
          url: job.data?.url ?? listing.url,
          posted: await when(listing.posted_at),
          description: description && description.length > MAX_DESCRIPTION_CHARS ? `${description.slice(0, MAX_DESCRIPTION_CHARS)}…` : description,
          evaluation: evaluation
            ? {
                overall_score: evaluation.overallScore,
                qualification: evaluation.qualification,
                criteria: evaluation.criteria,
                matched_skills: evaluation.matchedSkills,
                missing_skills: evaluation.missingSkills,
                experience_gaps: evaluation.experienceGaps,
                positives: evaluation.positiveFactors,
                negatives: evaluation.negativeFactors,
                explanation: evaluation.explanation,
                evaluated: await when(evaluation.evaluatedAt),
              }
            : null,
          documents: Object.fromEntries(latestByKind),
          screening_answers: {
            total: answers.data.length,
            verified: answers.data.filter((a) => a.is_verified).length,
          },
          pages: { job: `/jobs/${listing.id}`, studio: `/application-studio/${listing.application_id}` },
        };
      },
    }),

    defineTool({
      name: "get_recent_activity",
      description: "Recent application events (status changes, drafting, ready for approval), newest first, with the job they belong to.",
      parameters: z.object({ limit: z.number().int().min(1).max(30) }),
      execute: async ({ limit }) => {
        const { data: events, error } = await supabase
          .from("application_events")
          .select("application_id, event_type, from_status, to_status, actor, message, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) throw new RepositoryError("Failed to load activity", { cause: error });
        const ids = [...new Set(events.map((event) => event.application_id))];
        const jobs = new Map<string, { title: string; company: string }>();
        if (ids.length > 0) {
          const { data, error: jobsError } = await supabase
            .from("job_listings")
            .select("application_id, title, company")
            .eq("user_id", userId)
            .in("application_id", ids);
          if (jobsError) throw new RepositoryError("Failed to load activity jobs", { cause: jobsError });
          for (const row of data) jobs.set(row.application_id, { title: row.title, company: row.company });
        }
        return Promise.all(
          events.map(async (event) => ({
            when: await when(event.created_at),
            event: event.event_type,
            from: event.from_status,
            to: event.to_status,
            by: event.actor,
            message: event.message,
            job: jobs.get(event.application_id) ?? null,
          })),
        );
      },
    }),

    defineTool({
      name: "get_ai_usage",
      description:
        "AI calls made by JobPilot in the last N days: count, failures and tokens per operation (job.evaluate, studio.*, assistant.chat). Costs are not tracked.",
      parameters: z.object({ days: z.number().int().min(1).max(90) }),
      execute: async ({ days }) => {
        const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from("ai_usage_events")
          .select("operation, model, input_tokens, output_tokens, succeeded, error_code")
          .eq("user_id", userId)
          .gte("created_at", since)
          .limit(10_000);
        if (error) throw new RepositoryError("Failed to load AI usage", { cause: error });
        const byOperation: Record<string, { calls: number; failed: number; input_tokens: number; output_tokens: number; errors: string[] }> = {};
        for (const row of data) {
          const entry = (byOperation[row.operation] ??= { calls: 0, failed: 0, input_tokens: 0, output_tokens: 0, errors: [] });
          entry.calls += 1;
          entry.input_tokens += row.input_tokens;
          entry.output_tokens += row.output_tokens;
          if (!row.succeeded) {
            entry.failed += 1;
            if (row.error_code && !entry.errors.includes(row.error_code)) entry.errors.push(row.error_code);
          }
        }
        return { days, total_calls: data.length, models: [...new Set(data.map((row) => row.model))], by_operation: byOperation, cost: "not tracked" };
      },
    }),

    defineTool({
      name: "get_profile_summary",
      description:
        "The user's verified profile facts used for matching and documents (headline, skills, experience, education, certifications, projects) and job preferences. No contact details.",
      parameters: z.object({}),
      execute: async () => {
        const candidate = await loadCandidateContext(ctx);
        return { facts: candidate.facts, preferences: candidate.preferences };
      },
    }),
  ];
}
