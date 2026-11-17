import { z } from "zod";

const judgement = z.object({
  score: z.number().int().min(0).max(100),
  reasoning: z.string(),
});

/**
 * What the model returns for prompt `job.evaluate`. Sent as a strict JSON schema
 * (structured outputs) and re-validated with Zod after the call.
 */
export const evaluationOutputSchema = z.object({
  requirements: z
    .array(
      z.object({
        kind: z.enum(["skill", "experience", "education", "responsibility", "other"]),
        description: z.string(),
        is_required: z.boolean(),
        min_years: z.number().min(0).max(50).nullable(),
      }),
    )
    .max(40),
  technical_skills: judgement,
  experience: judgement,
  responsibilities: judgement,
  matched_skills: z.array(z.string()).max(60),
  missing_skills: z.array(z.string()).max(60),
  experience_gaps: z.array(z.string()).max(15),
  positive_factors: z.array(z.string()).max(15),
  negative_factors: z.array(z.string()).max(15),
  explanation: z.string(),
});
export type EvaluationOutput = z.infer<typeof evaluationOutputSchema>;

export const evaluateJobSchema = z.object({ jobId: z.uuid(), force: z.boolean() });
