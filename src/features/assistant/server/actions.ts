"use server";

import { z } from "zod";
import type { ActionResult } from "@/server/action-result";
import { runAction } from "@/server/run-action";
import { UserFacingError } from "@/server/errors";
import { isAiConfigured } from "@/lib/ai/run-structured";
import { threadIdSchema } from "../schemas";
import { deleteThread, getThreadMessages, listThreads, type AssistantMessage, type AssistantThread } from "./assistant-repository";

/*
 * Ask JobPilot lives in the app shell and loads on demand when the panel opens,
 * so its reads are actions too. None of them refresh the current route. Questions are sent
 * to POST /api/assistant/messages, which streams progress.
 */

export async function loadAssistantAction(): Promise<ActionResult<{ aiReady: boolean; threads: AssistantThread[] }>> {
  return runAction({
    schema: z.undefined(),
    input: undefined,
    event: "assistant.threads.load",
    failMessage: "Could not load conversations.",
    refreshRoute: false,
    run: async (ctx) => ({ aiReady: isAiConfigured(), threads: await listThreads(ctx) }),
  });
}

export async function loadThreadAction(input: unknown): Promise<ActionResult<AssistantMessage[]>> {
  return runAction({
    schema: threadIdSchema,
    input,
    event: "assistant.thread.load",
    failMessage: "Could not load this conversation.",
    refreshRoute: false,
    run: async (ctx, { threadId }) => {
      const messages = await getThreadMessages(ctx, threadId);
      if (!messages) throw new UserFacingError("This conversation no longer exists.");
      return messages;
    },
  });
}

export async function deleteAssistantThreadAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: threadIdSchema,
    input,
    event: "assistant.thread.delete",
    failMessage: "Could not delete the conversation.",
    refreshRoute: false,
    run: async (ctx, { threadId }) => {
      await deleteThread(ctx, threadId);
      return null;
    },
  });
}
