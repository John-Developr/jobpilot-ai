import { z } from "zod";

export const MAX_QUESTION_LENGTH = 4000;

export const sendMessageSchema = z.object({
  threadId: z.uuid().nullable(),
  message: z.string().trim().min(1, "Type a question.").max(MAX_QUESTION_LENGTH, `Keep it under ${MAX_QUESTION_LENGTH} characters.`),
  /** Path of the page the user is on, so "this job" can be resolved. Never a full URL. */
  page: z
    .string()
    .max(200)
    .regex(/^\/[A-Za-z0-9/_-]*$/)
    .catch("/"),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const threadIdSchema = z.object({ threadId: z.uuid() });

/** First line of the question, shortened, as the conversation title. */
export function threadTitle(message: string): string {
  const line = message.trim().split("\n")[0]?.trim() ?? "";
  if (!line) return "New conversation";
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

export const assistantMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  toolsUsed: z.array(z.string()),
  createdAt: z.string(),
});
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;

/** NDJSON events streamed by POST /api/assistant/messages, one JSON object per line. */
export const assistantStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("thinking"), step: z.number().int() }),
  z.object({ type: z.literal("tools"), names: z.array(z.string()) }),
  z.object({ type: z.literal("text"), delta: z.string() }),
  z.object({ type: z.literal("done"), threadId: z.string(), messages: z.array(assistantMessageSchema) }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type AssistantStreamEvent = z.infer<typeof assistantStreamEventSchema>;
