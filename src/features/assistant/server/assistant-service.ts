import "server-only";
import type { AuthenticatedContext } from "@/server/auth";
import { UserFacingError } from "@/server/errors";
import { AiOutputError, loadActivePrompt, runConversation, type ConversationEvent } from "@/lib/ai/run-structured";
import { getAutomationSettings } from "@/features/settings/server/automation-settings-repository";
import { threadTitle, type SendMessageInput } from "../schemas";
import { buildAssistantTools } from "./assistant-tools";
import {
  appendExchange,
  CONTEXT_MESSAGE_LIMIT,
  createThread,
  deleteThread,
  getThreadMessages,
  type AssistantMessage,
} from "./assistant-repository";

export interface AssistantReply {
  threadId: string;
  /** The saved question and answer, oldest first. */
  messages: AssistantMessage[];
}

/**
 * Answers one question. Nothing is saved unless the model answers, so a failure
 * leaves the conversation unchanged and the question can simply be sent again.
 */
export async function sendMessage(
  ctx: AuthenticatedContext,
  { threadId, message, page }: SendMessageInput,
  onEvent?: (event: ConversationEvent) => void,
): Promise<AssistantReply> {
  const history = threadId ? await getThreadMessages(ctx, threadId, CONTEXT_MESSAGE_LIMIT) : [];
  if (history === null) throw new UserFacingError("This conversation no longer exists. Start a new one.");

  const now = new Date();
  const [prompt, settings] = await Promise.all([loadActivePrompt(ctx, "assistant.chat"), getAutomationSettings(ctx)]);

  let answer;
  try {
    answer = await runConversation({
      ctx,
      prompt,
      variables: {
        timezone: settings.timezone,
        today: new Intl.DateTimeFormat("en-US", { timeZone: settings.timezone, dateStyle: "full" }).format(now),
        current_page: page,
      },
      messages: [...history.map(({ role, content }) => ({ role, content })), { role: "user", content: message }],
      tools: buildAssistantTools(ctx, now),
      onEvent,
    });
  } catch (error) {
    if (error instanceof AiOutputError) throw new UserFacingError(error.message);
    throw error;
  }

  const id = threadId ?? (await createThread(ctx, threadTitle(message)));
  try {
    const saved = await appendExchange(ctx, id, message, { content: answer.text.slice(0, 20_000), toolsUsed: answer.toolsUsed });
    return { threadId: id, messages: saved };
  } catch (error) {
    // Do not leave an empty conversation behind when it was created for this message.
    if (!threadId) await deleteThread(ctx, id).catch(() => undefined);
    throw error;
  }
}
