import { z } from "zod";

export const RESUME_MIME_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
} as const;
export type ResumeMimeType = keyof typeof RESUME_MIME_TYPES;
const MIME_TYPES = Object.keys(RESUME_MIME_TYPES) as [ResumeMimeType, ...ResumeMimeType[]];

/** Must not exceed the `documents` bucket limit (10 MB). */
export const MAX_RESUME_BYTES = 10 * 1024 * 1024;

export const resumeSchema = z.object({
  name: z.string().trim().min(1, "Required.").max(120, "Keep it under 120 characters."),
  targetCategory: z.string().trim().max(80, "Keep it under 80 characters."),
  summary: z.string().trim().max(3000, "Keep it under 3000 characters."),
  emphasizedSkills: z.array(z.string().trim().min(1).max(60)).max(30, "Up to 30 skills."),
});
export type ResumeInput = z.infer<typeof resumeSchema>;

export const resumeIdSchema = z.object({ id: z.uuid() });

export const prepareUploadSchema = z.object({
  resumeId: z.uuid(),
  mimeType: z.enum(MIME_TYPES, "Upload a PDF or Word (.docx) file."),
  size: z.number().int().positive().max(MAX_RESUME_BYTES, "Files must be 10 MB or smaller."),
});

export const confirmUploadSchema = z.object({
  resumeId: z.uuid(),
  path: z.string().min(1).max(300),
});

export function isResumeMimeType(value: string | null | undefined): value is ResumeMimeType {
  return typeof value === "string" && Object.hasOwn(RESUME_MIME_TYPES, value);
}
