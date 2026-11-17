import { z } from "zod";
import { DOCUMENT_KINDS } from "./documents";

const kind = z.enum(DOCUMENT_KINDS);
const applicationId = z.uuid();

export const generateDocumentSchema = z.object({
  applicationId,
  kind,
  instructions: z.string().trim().max(1000, "Keep instructions under 1000 characters."),
});

export const saveDocumentSchema = z.object({
  applicationId,
  kind,
  content: z.string().trim().min(1, "The document is empty.").max(50_000, "The document is too long."),
});

export const restoreVersionSchema = z.object({ applicationId, kind, version: z.number().int().positive() });

export const setResumeSchema = z.object({ applicationId, resumeId: z.uuid().nullable() });

export const markReadySchema = z.object({ applicationId, confirmFlags: z.boolean() });

export const answerSchema = z.object({
  question: z.string().trim().min(1, "Enter the question.").max(2000, "Keep the question under 2000 characters."),
  answer: z.string().trim().max(10_000, "Keep the answer under 10,000 characters."),
  isVerified: z.boolean(),
});
export type AnswerInput = z.infer<typeof answerSchema>;

export const createAnswerSchema = z.object({ applicationId, question: answerSchema.shape.question });
export const updateAnswerSchema = z.object({ id: z.uuid(), values: answerSchema });
export const answerIdSchema = z.object({ id: z.uuid() });
