import "server-only";
import { z } from "zod";
import type { AuthenticatedContext } from "@/server/auth";
import { UserFacingError } from "@/server/errors";
import { logger } from "@/lib/monitoring/logger";
import { AiOutputError, loadActivePrompt, runStructured } from "@/lib/ai/run-structured";
import { buildJobFacts } from "@/features/evaluation/facts";
import { loadCandidateContext, type CandidateContext } from "@/features/evaluation/server/candidate-context";
import { getLatestEvaluation, type JobEvaluation } from "@/features/evaluation/server/evaluation-repository";
import { getJob, type JobDetail } from "@/features/jobs/server/job-repository";
import { listResumes, type Resume } from "@/features/resumes/server/resume-repository";
import { buildSignature, DOCUMENT_CONFIG, type DocumentKind } from "../documents";
import { checkGrounding } from "../grounding";
import { getAnswer, getStudioApplication, saveDocumentVersion, updateAnswer } from "./studio-repository";

const documentOutputSchema = z.object({ content: z.string().min(1), notes: z.string() });
const answerOutputSchema = z.object({
  answer: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  needs_user_input: z.string().nullable(),
});

interface GenerationContext {
  job: JobDetail;
  candidate: CandidateContext;
  evaluation: JobEvaluation | null;
  resume: Resume | null;
}

async function loadGenerationContext(
  ctx: AuthenticatedContext,
  applicationId: string,
  options: { forAi: boolean },
): Promise<GenerationContext> {
  const application = await getStudioApplication(ctx, applicationId);
  if (!application) throw new UserFacingError("This application no longer exists.");
  const [job, candidate, evaluation, resumes] = await Promise.all([
    getJob(ctx, application.jobId),
    loadCandidateContext(ctx),
    getLatestEvaluation(ctx, application.jobId),
    listResumes(ctx),
  ]);
  if (!job) throw new UserFacingError("This job no longer exists.");
  if (options.forAi && candidate.skills.length === 0 && candidate.experiences.length === 0) {
    throw new UserFacingError("Add your experience and skills to your profile before generating documents.");
  }
  const resume =
    resumes.find((r) => r.id === application.resumeId) ?? resumes.find((r) => r.isDefault) ?? null;
  return { job, candidate, evaluation, resume };
}

function promptVariables(context: GenerationContext, extra: Record<string, string>) {
  const { evaluation, resume } = context;
  const match = evaluation
    ? {
        score: evaluation.overallScore,
        matched_skills: evaluation.matchedSkills,
        missing_skills: evaluation.missingSkills,
        strengths: evaluation.positiveFactors,
        gaps: [...evaluation.experienceGaps, ...evaluation.negativeFactors],
      }
    : "(not scored yet)";
  const resumeFocus = resume
    ? { name: resume.name, target_category: resume.targetCategory, summary: resume.summary, emphasized_skills: resume.emphasizedSkills }
    : "(no resume version selected)";
  return {
    profile: JSON.stringify(context.candidate.facts, null, 1),
    job: JSON.stringify(buildJobFacts(context.job), null, 1),
    match: typeof match === "string" ? match : JSON.stringify(match, null, 1),
    resume: typeof resumeFocus === "string" ? resumeFocus : JSON.stringify(resumeFocus, null, 1),
    ...extra,
  };
}

/** Verified sources a document may draw numbers and skills from. */
function groundingContext(context: GenerationContext) {
  const { candidate, evaluation, resume, job } = context;
  return {
    vocabulary: candidate.vocabulary,
    jobSkillTerms: [
      ...(evaluation?.missingSkills ?? []),
      ...(evaluation?.requirements.filter((r) => r.kind === "skill").map((r) => r.description) ?? []),
    ],
    sourceText: [
      JSON.stringify(candidate.facts),
      JSON.stringify(resume ?? {}),
      job.description ?? "",
      job.title,
      // Contact details the user may type into a sign-off.
      candidate.personal.phone,
      candidate.personal.email,
      ...candidate.links,
    ].join("\n"),
  };
}

function contactFor(candidate: CandidateContext) {
  return {
    fullName: candidate.personal.fullName,
    email: candidate.personal.email,
    phone: candidate.personal.phone,
    links: candidate.links,
  };
}

async function generate<T>(
  ctx: AuthenticatedContext,
  promptKey: string,
  variables: Record<string, string>,
  schema: z.ZodType<T>,
  schemaName: string,
) {
  const prompt = await loadActivePrompt(ctx, promptKey);
  try {
    return await runStructured({ ctx, prompt, variables, schema, schemaName });
  } catch (error) {
    if (error instanceof AiOutputError) {
      logger.error("studio.ai_output_invalid", { userId: ctx.userId, promptKey, error });
      throw new UserFacingError("The AI returned unusable text. Try again; nothing was saved.");
    }
    throw error;
  }
}

export interface GeneratedDocument {
  version: number;
  flags: string[];
  notes: string;
}

/** Generates one section as a new version. Contact details are appended by the app. */
export async function generateDocument(
  ctx: AuthenticatedContext,
  applicationId: string,
  kind: DocumentKind,
  instructions: string,
): Promise<GeneratedDocument> {
  const context = await loadGenerationContext(ctx, applicationId, { forAi: true });
  const config = DOCUMENT_CONFIG[kind];
  const result = await generate(
    ctx,
    config.promptKey,
    promptVariables(context, { instructions: instructions || "(none)" }),
    documentOutputSchema,
    "studio_document",
  );
  const body = result.data.content.trim();
  const flags = checkGrounding(body, groundingContext(context));
  const version = await saveDocumentVersion(ctx, {
    applicationId,
    kind,
    title: `${config.label} — ${context.job.title} at ${context.job.company}`,
    content: body + buildSignature(kind, contactFor(context.candidate)),
    source: "ai",
    model: result.model,
    promptVersionId: result.promptVersionId,
    groundingFlags: flags,
  });
  return { version, flags, notes: result.data.notes };
}

/** Saves the user's edited text as a new version; the grounding check runs on edits too. */
export async function saveEditedDocument(
  ctx: AuthenticatedContext,
  applicationId: string,
  kind: DocumentKind,
  content: string,
): Promise<{ version: number; flags: string[] }> {
  const context = await loadGenerationContext(ctx, applicationId, { forAi: false });
  const flags = checkGrounding(content, groundingContext(context));
  const version = await saveDocumentVersion(ctx, {
    applicationId,
    kind,
    title: `${DOCUMENT_CONFIG[kind].label} — ${context.job.title} at ${context.job.company}`,
    content,
    source: "user",
    model: null,
    promptVersionId: null,
    groundingFlags: flags,
  });
  return { version, flags };
}

export interface GeneratedAnswer {
  confidence: "high" | "medium" | "low";
  needsUserInput: string | null;
}

/** Drafts an answer. It always starts unverified: automation only uses answers you verify. */
export async function generateAnswer(ctx: AuthenticatedContext, answerId: string): Promise<GeneratedAnswer> {
  const answer = await getAnswer(ctx, answerId);
  const context = await loadGenerationContext(ctx, answer.applicationId, { forAi: true });
  const result = await generate(
    ctx,
    "studio.screening_answer",
    promptVariables(context, { question: answer.question }),
    answerOutputSchema,
    "screening_answer",
  );
  await updateAnswer(ctx, answerId, {
    question: answer.question,
    answer: result.data.answer.trim(),
    isVerified: false,
    source: "ai",
    model: result.model,
    promptVersionId: result.promptVersionId,
  });
  return { confidence: result.data.confidence, needsUserInput: result.data.needs_user_input };
}
