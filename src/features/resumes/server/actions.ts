"use server";

import type { ActionResult } from "@/server/action-result";
import { runAction } from "@/server/run-action";
import { updateOf } from "@/features/profile/schemas";
import { confirmUploadSchema, prepareUploadSchema, resumeIdSchema, resumeSchema } from "../schemas";
import * as resumes from "./resume-repository";

const done = () => null;

export async function createResumeAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: resumeSchema,
    input,
    event: "resumes.resume.create",
    failMessage: "Could not create the resume. Try again.",
    run: (ctx, data) => resumes.createResume(ctx, data).then(done),
  });
}

export async function updateResumeAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: updateOf(resumeSchema),
    input,
    event: "resumes.resume.update",
    failMessage: "Could not save the resume. Try again.",
    run: (ctx, { id, values }) => resumes.updateResume(ctx, id, values).then(done),
  });
}

export async function setDefaultResumeAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: resumeIdSchema,
    input,
    event: "resumes.resume.set_default",
    failMessage: "Could not change the default resume. Try again.",
    run: (ctx, { id }) => resumes.setDefaultResume(ctx, id).then(done),
  });
}

export async function deleteResumeAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: resumeIdSchema,
    input,
    event: "resumes.resume.delete",
    failMessage: "Could not delete the resume. Try again.",
    run: (ctx, { id }) => resumes.deleteResume(ctx, id).then(done),
  });
}

export async function prepareResumeUploadAction(input: unknown): Promise<ActionResult<{ path: string; token: string }>> {
  return runAction({
    schema: prepareUploadSchema,
    input,
    event: "resumes.file.prepare_upload",
    failMessage: "Could not start the upload. Try again.",
    run: (ctx, { resumeId, mimeType }) => resumes.prepareResumeUpload(ctx, resumeId, mimeType),
    refreshRoute: false,
  });
}

export async function confirmResumeUploadAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: confirmUploadSchema,
    input,
    event: "resumes.file.attach",
    failMessage: "Could not attach the file. Try again.",
    run: (ctx, { resumeId, path }) => resumes.confirmResumeUpload(ctx, resumeId, path).then(done),
  });
}

export async function removeResumeFileAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: resumeIdSchema,
    input,
    event: "resumes.file.remove",
    failMessage: "Could not remove the file. Try again.",
    run: (ctx, { id }) => resumes.removeResumeFile(ctx, id).then(done),
  });
}
