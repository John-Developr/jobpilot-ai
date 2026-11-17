import "server-only";
import type { AuthenticatedContext } from "@/server/auth";
import { assertMutation, RepositoryError } from "@/server/errors";
import type { AssistantMessage } from "../schemas";

export type { AssistantMessage };

export interface AssistantThread {
  id: string;
  title: string;
  updatedAt: string;
}


const THREAD_LIST_LIMIT = 30;
/** Earlier turns sent back to the model as conversation context. */
export const CONTEXT_MESSAGE_LIMIT = 20;

export async function listThreads({ supabase, userId }: AuthenticatedContext): Promise<AssistantThread[]> {
  const { data, error } = await supabase
    .from("assistant_threads")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(THREAD_LIST_LIMIT);
  if (error) throw new RepositoryError("Failed to load conversations", { cause: error });
  return data.map((row) => ({ id: row.id, title: row.title, updatedAt: row.updated_at }));
}

/** The newest `limit` messages of a thread, oldest first. Null when the thread is not the user's. */
export async function getThreadMessages(
  { supabase, userId }: AuthenticatedContext,
  threadId: string,
  limit = 200,
): Promise<AssistantMessage[] | null> {
  const [thread, messages] = await Promise.all([
    supabase.from("assistant_threads").select("id").eq("user_id", userId).eq("id", threadId).maybeSingle(),
    supabase
      .from("assistant_messages")
      .select("id, role, content, tools_used, created_at")
      .eq("user_id", userId)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  if (thread.error) throw new RepositoryError("Failed to load conversation", { cause: thread.error });
  if (messages.error) throw new RepositoryError("Failed to load messages", { cause: messages.error });
  if (!thread.data) return null;
  return messages.data
    .map((row) => ({ id: row.id, role: row.role, content: row.content, toolsUsed: row.tools_used, createdAt: row.created_at }))
    .reverse();
}

export async function createThread({ supabase, userId }: AuthenticatedContext, title: string): Promise<string> {
  const { data, error } = await supabase.from("assistant_threads").insert({ user_id: userId, title }).select("id").single();
  if (error) throw new RepositoryError("Failed to start conversation", { cause: error });
  return data.id;
}

/** Saves a question and its answer together, so a failed answer never leaves a dangling question. */
export async function appendExchange(
  { supabase, userId }: AuthenticatedContext,
  threadId: string,
  question: string,
  answer: { content: string; toolsUsed: string[] },
): Promise<AssistantMessage[]> {
  const askedAt = new Date();
  const { data, error } = await supabase
    .from("assistant_messages")
    .insert([
      // Every column is listed on both rows: a multi-row insert sends omitted columns as null, not their default.
      { user_id: userId, thread_id: threadId, role: "user", content: question, tools_used: [], created_at: askedAt.toISOString() },
      {
        user_id: userId,
        thread_id: threadId,
        role: "assistant",
        content: answer.content,
        tools_used: answer.toolsUsed,
        // One statement shares now(); keep the answer strictly after the question.
        created_at: new Date(askedAt.getTime() + 1).toISOString(),
      },
    ])
    .select("id, role, content, tools_used, created_at");
  if (error) throw new RepositoryError("Failed to save the conversation", { cause: error });
  return data
    .map((row) => ({ id: row.id, role: row.role, content: row.content, toolsUsed: row.tools_used, createdAt: row.created_at }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function deleteThread({ supabase, userId }: AuthenticatedContext, threadId: string): Promise<void> {
  const { data, error } = await supabase.from("assistant_threads").delete().eq("user_id", userId).eq("id", threadId).select("id");
  assertMutation("delete conversation", error, { affected: data });
}
