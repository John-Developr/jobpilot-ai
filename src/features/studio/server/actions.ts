"use server";

import type { ActionResult } from "@/server/action-result";
import { runAction } from "@/server/run-action";
import {
  answerIdSchema,
  createAnswerSchema,
  generateDocumentSchema,
  markReadySchema,
  restoreVersionSchema,
  saveDocumentSchema,
  setResumeSchema,
  updateAnswerSchema,
} from "../schemas";
import {
  generateAnswer,
  generateDocument,
  saveEditedDocument,
  type GeneratedAnswer,
  type GeneratedDocument,
} from "./generation-service";
import {
  createAnswer,
  deleteAnswer,
  getDocumentVersion,
  markApplicationReady,
  setApplicationResume,
  updateAnswer,
} from "./studio-repository";

const done = () => null;

export async function generateDocumentAction(input: unknown): Promise<ActionResult<GeneratedDocument>> {
  return runAction({
    schema: generateDocumentSchema,
    input,
    event: "studio.document.generate",
    failMessage: "Generation failed. Try again.",
    run: (ctx, { applicationId, kind, instructions }) => generateDocument(ctx, applicationId, kind, instructions),
  });
}

export async function saveDocumentAction(input: unknown): Promise<ActionResult<{ version: number; flags: string[] }>> {
  return runAction({
    schema: saveDocumentSchema,
    input,
    event: "studio.document.save",
    failMessage: "Could not save the document. Try again.",
    run: (ctx, { applicationId, kind, content }) => saveEditedDocument(ctx, applicationId, kind, content),
  });
}

/** Restoring copies an old version forward as the newest version (history is never rewritten). */
export async function restoreVersionAction(input: unknown): Promise<ActionResult<{ version: number; flags: string[] }>> {
  return runAction({
    schema: restoreVersionSchema,
    input,
    event: "studio.document.restore",
    failMessage: "Could not restore that version. Try again.",
    run: async (ctx, { applicationId, kind, version }) => {
      const old = await getDocumentVersion(ctx, applicationId, kind, version);
      return saveEditedDocument(ctx, applicationId, kind, old.content);
    },
  });
}

export async function setApplicationResumeAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: setResumeSchema,
    input,
    event: "studio.application.set_resume",
    failMessage: "Could not change the resume. Try again.",
    run: (ctx, { applicationId, resumeId }) => setApplicationResume(ctx, applicationId, resumeId).then(done),
  });
}

export async function markReadyAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: markReadySchema,
    input,
    event: "studio.application.ready",
    failMessage: "Could not update the application. Try again.",
    run: (ctx, { applicationId, confirmFlags }) => markApplicationReady(ctx, applicationId, confirmFlags).then(done),
  });
}

export async function createAnswerAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: createAnswerSchema,
    input,
    event: "studio.answer.create",
    failMessage: "Could not add the question. Try again.",
    run: (ctx, { applicationId, question }) => createAnswer(ctx, applicationId, question).then(done),
  });
}

export async function updateAnswerAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: updateAnswerSchema,
    input,
    event: "studio.answer.update",
    failMessage: "Could not save the answer. Try again.",
    run: (ctx, { id, values }) => updateAnswer(ctx, id, { ...values, source: "user" }).then(done),
  });
}

export async function deleteAnswerAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: answerIdSchema,
    input,
    event: "studio.answer.delete",
    failMessage: "Could not delete the question. Try again.",
    run: (ctx, { id }) => deleteAnswer(ctx, id).then(done),
  });
}

export async function generateAnswerAction(input: unknown): Promise<ActionResult<GeneratedAnswer>> {
  return runAction({
    schema: answerIdSchema,
    input,
    event: "studio.answer.generate",
    failMessage: "Could not draft an answer. Try again.",
    run: (ctx, { id }) => generateAnswer(ctx, id),
  });
}
