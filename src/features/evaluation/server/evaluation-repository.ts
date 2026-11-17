import "server-only";
import { z } from "zod";
import type { AuthenticatedContext } from "@/server/auth";
import { RepositoryError, UserFacingError } from "@/server/errors";
import type { DbEnum, Json } from "@/types/database";
import { CRITERIA, type Criterion } from "../scoring";

const criterionSchema = z.object({ score: z.number(), reasoning: z.string() });
const criteriaSchema = z.object(Object.fromEntries(CRITERIA.map((c) => [c, criterionSchema])) as Record<Criterion, typeof criterionSchema>);
const weightsRecordSchema = z.record(z.string(), z.number());

export interface JobEvaluation {
  id: string;
  overallScore: number;
  qualification: DbEnum<"qualification_level">;
  criteria: Record<Criterion, { score: number; reasoning: string }> | null;
  weights: Record<string, number>;
  matchedSkills: string[];
  missingSkills: string[];
  experienceGaps: string[];
  positiveFactors: string[];
  negativeFactors: string[];
  explanation: string;
  model: string;
  promptVersion: number | null;
  inputHash: string | null;
  evaluatedAt: string;
  requirements: { kind: DbEnum<"requirement_kind">; description: string; isRequired: boolean; minYears: number | null }[];
}

export async function getLatestEvaluation({ supabase, userId }: AuthenticatedContext, jobId: string): Promise<JobEvaluation | null> {
  const [score, requirements] = await Promise.all([
    supabase
      .from("job_scores")
      .select("*")
      .eq("user_id", userId)
      .eq("job_id", jobId)
      .order("evaluated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("job_requirements").select("*").eq("user_id", userId).eq("job_id", jobId).order("created_at"),
  ]);
  if (score.error) throw new RepositoryError("Failed to load evaluation", { cause: score.error });
  if (requirements.error) throw new RepositoryError("Failed to load requirements", { cause: requirements.error });
  const row = score.data;
  if (!row) return null;

  let promptVersion: number | null = null;
  if (row.prompt_version_id) {
    const { data } = await supabase.from("prompt_versions").select("version").eq("id", row.prompt_version_id).maybeSingle();
    promptVersion = data?.version ?? null;
  }
  const criteria = criteriaSchema.safeParse(row.criteria_scores);
  const weights = weightsRecordSchema.safeParse(row.criteria_weights);

  return {
    id: row.id,
    overallScore: row.overall_score,
    qualification: row.qualification,
    criteria: criteria.success ? criteria.data : null,
    weights: weights.success ? weights.data : {},
    matchedSkills: row.matched_skills,
    missingSkills: row.missing_skills,
    experienceGaps: row.experience_gaps,
    positiveFactors: row.positive_factors,
    negativeFactors: row.negative_factors,
    explanation: row.explanation,
    model: row.model,
    promptVersion,
    inputHash: row.input_hash,
    evaluatedAt: row.evaluated_at,
    requirements: requirements.data.map((r) => ({
      kind: r.kind,
      description: r.description,
      isRequired: r.is_required,
      minYears: r.min_years,
    })),
  };
}

export async function saveEvaluation(
  { supabase }: AuthenticatedContext,
  jobId: string,
  score: Json,
  requirements: Json,
  nextStatus: "qualified" | "discovered" | "archived",
): Promise<DbEnum<"application_status">> {
  const { data, error } = await supabase.rpc("record_job_evaluation", {
    p_job_id: jobId,
    p_score: score,
    p_requirements: requirements,
    p_next_status: nextStatus,
  });
  if (error?.code === "P0002") throw new UserFacingError("This job no longer exists. Refresh the page.");
  if (error) throw new RepositoryError("Failed to save evaluation", { cause: error });
  return data;
}

/** Newest jobs that have never been scored (archived ones excluded). */
export async function listUnevaluatedJobIds(
  { supabase, userId }: AuthenticatedContext,
  limit: number,
): Promise<{ ids: string[]; total: number }> {
  const { data, error, count } = await supabase
    .from("job_listings")
    .select("id", { count: "exact" })
    .eq("user_id", userId)
    .is("overall_score", null)
    .neq("status", "archived")
    .order("discovered_at", { ascending: false })
    .limit(limit);
  if (error) throw new RepositoryError("Failed to list unevaluated jobs", { cause: error });
  return { ids: data.map((row) => row.id), total: count ?? 0 };
}
