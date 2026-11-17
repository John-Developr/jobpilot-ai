import { z } from "zod";
import { REMOTE_TYPE_LABELS } from "@/config/labels";
import type { DbEnum } from "@/types/database";

/*
 * The matching engine's arithmetic. The model scores the three judgement criteria
 * (technical skills, experience, responsibilities); everything here is deterministic
 * and unit-tested. See docs/ai/matching-engine.md.
 */

export const CRITERIA = ["technical_skills", "experience", "responsibilities", "remote", "salary", "employment_type"] as const;
export type Criterion = (typeof CRITERIA)[number];

export const CRITERION_LABELS: Record<Criterion, string> = {
  technical_skills: "Technical skills",
  experience: "Experience",
  responsibilities: "Responsibilities",
  remote: "Remote compatibility",
  salary: "Salary compatibility",
  employment_type: "Employment type",
};

export const DEFAULT_WEIGHTS: Record<Criterion, number> = {
  technical_skills: 30,
  experience: 20,
  responsibilities: 20,
  remote: 15,
  salary: 10,
  employment_type: 5,
};

const weight = z.number().int().min(0).max(100);
export const weightsSchema = z
  .object({
    technical_skills: weight,
    experience: weight,
    responsibilities: weight,
    remote: weight,
    salary: weight,
    employment_type: weight,
  })
  .refine((w) => Object.values(w).reduce((a, b) => a + b, 0) > 0, { message: "At least one weight must be above 0." });
export type Weights = z.infer<typeof weightsSchema>;

/** Stored weights are read leniently: anything malformed falls back to the defaults. */
export function parseWeights(value: unknown): Weights {
  const parsed = weightsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_WEIGHTS;
}

/** Type alias (not interface) so scores are assignable to Json for storage. */
export type CriterionScore = {
  score: number;
  reasoning: string;
};

export type CriteriaScores = Record<Criterion, CriterionScore>;

// --- Deterministic criteria -------------------------------------------------------

export interface PreferenceFacts {
  acceptedRemoteTypes: DbEnum<"remote_type">[];
  willingToRelocate: boolean;
  employmentTypes: DbEnum<"employment_type">[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  salaryPeriod: DbEnum<"salary_period">;
}

export interface JobFacts {
  remoteType: DbEnum<"remote_type">;
  employmentType: DbEnum<"employment_type"> | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: DbEnum<"salary_period"> | null;
}

export function scoreRemote(job: JobFacts, prefs: PreferenceFacts): CriterionScore {
  if (job.remoteType === "unknown") {
    return { score: 60, reasoning: "The posting does not state its work arrangement." };
  }
  if (prefs.acceptedRemoteTypes.includes(job.remoteType)) {
    return { score: 100, reasoning: `${REMOTE_TYPE_LABELS[job.remoteType]} work matches your preferences.` };
  }
  if (job.remoteType === "hybrid") {
    return { score: prefs.willingToRelocate ? 55 : 40, reasoning: "Hybrid role; you prefer fully remote work." };
  }
  if (job.remoteType === "onsite") {
    return {
      score: prefs.willingToRelocate ? 40 : 10,
      reasoning: prefs.willingToRelocate
        ? "On-site role; you are open to relocation but prefer other arrangements."
        : "On-site role; you prefer remote or hybrid work.",
    };
  }
  return { score: 30, reasoning: "Remote role; your preferences exclude remote work." };
}

/** Approximate monthly amount, for comparing salaries across periods. */
const MONTHLY_FACTOR: Record<DbEnum<"salary_period">, number> = { hour: 160, day: 21.75, month: 1, year: 1 / 12 };

export function scoreSalary(job: JobFacts, prefs: PreferenceFacts): CriterionScore {
  const jobTop = job.salaryMax ?? job.salaryMin;
  if (jobTop === null || !job.salaryPeriod) {
    return { score: 50, reasoning: "The posting does not list a salary." };
  }
  if (prefs.salaryMin === null) {
    return { score: 50, reasoning: "You have not set a minimum salary in your preferences." };
  }
  if (!job.salaryCurrency || job.salaryCurrency !== prefs.salaryCurrency) {
    return {
      score: 50,
      reasoning: `Salary is in ${job.salaryCurrency ?? "an unknown currency"}; your preference is in ${prefs.salaryCurrency}, so it was not compared.`,
    };
  }
  const jobMonthly = jobTop * MONTHLY_FACTOR[job.salaryPeriod];
  const wantMonthly = prefs.salaryMin * MONTHLY_FACTOR[prefs.salaryPeriod];
  const ratio = jobMonthly / wantMonthly;
  if (ratio >= 1) return { score: 100, reasoning: "The salary range reaches your minimum." };
  if (ratio >= 0.85) return { score: 60, reasoning: "The salary range tops out slightly below your minimum." };
  return { score: 20, reasoning: "The salary range is well below your minimum." };
}

export function scoreEmploymentType(job: JobFacts, prefs: PreferenceFacts): CriterionScore {
  if (!job.employmentType) return { score: 60, reasoning: "The posting does not state an employment type." };
  if (prefs.employmentTypes.includes(job.employmentType)) {
    return { score: 100, reasoning: "Employment type matches your preferences." };
  }
  return { score: 20, reasoning: "Employment type is not one you are looking for." };
}

// --- Combination and qualification ---------------------------------------------------

export function overallScore(criteria: CriteriaScores, weights: Weights): number {
  let total = 0;
  let weightSum = 0;
  for (const criterion of CRITERIA) {
    const w = weights[criterion];
    total += clamp(criteria[criterion].score) * w;
    weightSum += w;
  }
  return weightSum === 0 ? 0 : Math.round(total / weightSum);
}

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

export function qualificationFor(score: number): DbEnum<"qualification_level"> {
  if (score >= 85) return "high_priority";
  if (score >= 70) return "recommended";
  if (score >= 55) return "manual_review";
  return "archive";
}

/**
 * Pipeline status after evaluation. Qualified needs both a recommending level and the
 * user's minimum match score; below 55 is archived (reversible, explanation stored);
 * everything else waits for manual review in "discovered".
 */
export function statusAfterEvaluation(score: number, minMatchScore: number): "qualified" | "discovered" | "archived" {
  const level = qualificationFor(score);
  if (level === "archive") return "archived";
  if ((level === "high_priority" || level === "recommended") && score >= minMatchScore) return "qualified";
  return "discovered";
}
