import "server-only";
import { createHash } from "node:crypto";
import type { AuthenticatedContext } from "@/server/auth";
import type { DbEnum } from "@/types/database";
import { UserFacingError } from "@/server/errors";
import { logger } from "@/lib/monitoring/logger";
import { AiOutputError, loadActivePrompt, runStructured } from "@/lib/ai/run-structured";
import { getJob } from "@/features/jobs/server/job-repository";
import { getAutomationSettings } from "@/features/settings/server/automation-settings-repository";
import { buildJobFacts, groundMatchedSkills } from "../facts";
import { loadCandidateContext } from "./candidate-context";
import { evaluationOutputSchema } from "../schemas";
import {
  overallScore,
  qualificationFor,
  scoreEmploymentType,
  scoreRemote,
  scoreSalary,
  statusAfterEvaluation,
  type CriteriaScores,
} from "../scoring";
import { getLatestEvaluation, saveEvaluation } from "./evaluation-repository";

export interface EvaluationSummary {
  score: number;
  qualification: DbEnum<"qualification_level">;
  status: DbEnum<"application_status">;
  cached: boolean;
}

const PROMPT_KEY = "job.evaluate";

/**
 * Scores one job against the verified profile. Reuses the latest score when nothing
 * that affects it changed (prompt, model, profile, job, weights), unless forced.
 */
export async function evaluateJob(ctx: AuthenticatedContext, jobId: string, force: boolean): Promise<EvaluationSummary> {
  const job = await getJob(ctx, jobId);
  if (!job) throw new UserFacingError("This job no longer exists. Refresh the page.");

  const [candidateContext, settings, prompt, latest] = await Promise.all([
    loadCandidateContext(ctx),
    getAutomationSettings(ctx),
    loadActivePrompt(ctx, PROMPT_KEY),
    getLatestEvaluation(ctx, jobId),
  ]);
  const { skills, experiences, preferences, vocabulary, facts: candidate } = candidateContext;

  if (skills.length === 0 && experiences.length === 0) {
    throw new UserFacingError("Add your experience and skills to your profile before scoring jobs.");
  }

  const jobFacts = buildJobFacts(job);
  const weights = settings.scoringWeights;
  const jobMeta = {
    remoteType: job.remote_type,
    employmentType: job.employment_type,
    salaryMin: job.salary_min,
    salaryMax: job.salary_max,
    salaryCurrency: job.salary_currency,
    salaryPeriod: job.salary_period,
  };

  const inputHash = createHash("sha256")
    .update(JSON.stringify({ prompt: prompt.id, model: prompt.model, candidate, jobFacts, jobMeta, preferences, weights, min: settings.minMatchScore }))
    .digest("hex");

  if (!force && latest?.inputHash === inputHash) {
    return { score: latest.overallScore, qualification: latest.qualification, status: job.status, cached: true };
  }

  let output;
  let model = prompt.model;
  try {
    const result = await runStructured({
      ctx,
      prompt,
      variables: { profile: JSON.stringify(candidate, null, 1), job: JSON.stringify(jobFacts, null, 1) },
      schema: evaluationOutputSchema,
      schemaName: "job_evaluation",
    });
    output = result.data;
    // Failover may answer with a fallback model; record the one that actually scored.
    model = result.model;
  } catch (error) {
    if (error instanceof AiOutputError) {
      logger.error("evaluation.ai_output_invalid", { userId: ctx.userId, jobId, error });
      throw new UserFacingError("The AI returned an unusable evaluation. Try again; nothing was saved.");
    }
    throw error;
  }

  const grounded = groundMatchedSkills(output.matched_skills, vocabulary);
  if (grounded.dropped.length > 0) {
    logger.warn("evaluation.ungrounded_skills_dropped", { userId: ctx.userId, jobId, count: grounded.dropped.length });
  }

  const prefs = {
    acceptedRemoteTypes: preferences.acceptedRemoteTypes,
    willingToRelocate: preferences.willingToRelocate,
    employmentTypes: preferences.employmentTypes,
    salaryMin: preferences.salaryMin,
    salaryMax: preferences.salaryMax,
    salaryCurrency: preferences.salaryCurrency,
    salaryPeriod: preferences.salaryPeriod,
  };
  const criteria: CriteriaScores = {
    technical_skills: output.technical_skills,
    experience: output.experience,
    responsibilities: output.responsibilities,
    remote: scoreRemote(jobMeta, prefs),
    salary: scoreSalary(jobMeta, prefs),
    employment_type: scoreEmploymentType(jobMeta, prefs),
  };
  const score = overallScore(criteria, weights);
  const qualification = qualificationFor(score);
  const nextStatus = statusAfterEvaluation(score, settings.minMatchScore);

  const status = await saveEvaluation(
    ctx,
    jobId,
    {
      overall_score: score,
      qualification,
      criteria_scores: criteria,
      criteria_weights: weights,
      matched_skills: grounded.kept,
      missing_skills: output.missing_skills,
      experience_gaps: output.experience_gaps,
      positive_factors: output.positive_factors,
      negative_factors: output.negative_factors,
      explanation: output.explanation,
      model,
      prompt_version_id: prompt.id,
      input_hash: inputHash,
    },
    output.requirements,
    nextStatus,
  );

  return { score, qualification, status, cached: false };
}
