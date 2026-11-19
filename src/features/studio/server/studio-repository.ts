import "server-only";
import type { AuthenticatedContext } from "@/server/auth";
import { assertMutation, RepositoryError, throwRpcError, UserFacingError } from "@/server/errors";
import type { DbEnum, Tables, Views } from "@/types/database";
import { DOCUMENT_KINDS, isDocumentKind, type DocumentKind } from "../documents";
import type { AnswerInput } from "../schemas";

export interface StudioDocument {
  id: string;
  kind: DocumentKind;
  version: number;
  title: string | null;
  content: string;
  source: DbEnum<"answer_source">;
  model: string | null;
  groundingFlags: string[];
  createdAt: string;
}

export interface StudioAnswer {
  id: string;
  question: string;
  answer: string;
  source: DbEnum<"answer_source">;
  isVerified: boolean;
  model: string | null;
}

export interface StudioApplication {
  id: string;
  jobId: string;
  status: DbEnum<"application_status">;
  resumeId: string | null;
}

const STUDIO_STATUSES = ["qualified", "drafting", "pending_approval"] as const;

export type StudioListItem = Views<"job_listings"> & { documentCount: number };

/** Applications being prepared: qualified, drafting or waiting for approval. */
export async function listStudioApplications({ supabase, userId }: AuthenticatedContext): Promise<StudioListItem[]> {
  const { data, error } = await supabase
    .from("job_listings")
    .select("*")
    .eq("user_id", userId)
    .in("status", [...STUDIO_STATUSES])
    .order("overall_score", { ascending: false, nullsFirst: false })
    .order("discovered_at", { ascending: false })
    .limit(100);
  if (error) throw new RepositoryError("Failed to load studio applications", { cause: error });
  if (data.length === 0) return [];

  const { data: docs, error: docsError } = await supabase
    .from("application_documents")
    .select("application_id")
    .eq("user_id", userId)
    .in(
      "application_id",
      data.map((row) => row.application_id),
    );
  if (docsError) throw new RepositoryError("Failed to count documents", { cause: docsError });
  const counts = new Map<string, number>();
  for (const doc of docs) counts.set(doc.application_id, (counts.get(doc.application_id) ?? 0) + 1);
  return data.map((row) => ({ ...row, documentCount: counts.get(row.application_id) ?? 0 }));
}

export async function getStudioApplication({ supabase, userId }: AuthenticatedContext, applicationId: string): Promise<StudioApplication | null> {
  const { data, error } = await supabase
    .from("applications")
    .select("id, job_id, status, resume_id")
    .eq("user_id", userId)
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw new RepositoryError("Failed to load application", { cause: error });
  return data ? { id: data.id, jobId: data.job_id, status: data.status, resumeId: data.resume_id } : null;
}

function documentFromRow(row: Tables<"application_documents">): StudioDocument | null {
  const kind = row.kind;
  if (!isDocumentKind(kind)) return null;
  return {
    id: row.id,
    kind,
    version: row.version,
    title: row.title,
    content: row.content,
    source: row.source,
    model: row.model,
    groundingFlags: row.grounding_flags,
    createdAt: row.created_at,
  };
}

/** All versions of every document, newest first, grouped by kind. */
export async function listDocuments(
  { supabase, userId }: AuthenticatedContext,
  applicationId: string,
): Promise<Record<DocumentKind, StudioDocument[]>> {
  const { data, error } = await supabase
    .from("application_documents")
    .select("*")
    .eq("user_id", userId)
    .eq("application_id", applicationId)
    .order("version", { ascending: false });
  if (error) throw new RepositoryError("Failed to load documents", { cause: error });
  const grouped = Object.fromEntries(DOCUMENT_KINDS.map((k) => [k, [] as StudioDocument[]])) as Record<DocumentKind, StudioDocument[]>;
  for (const row of data) {
    const doc = documentFromRow(row);
    if (doc) grouped[doc.kind].push(doc);
  }
  return grouped;
}

export async function getDocumentVersion(
  { supabase, userId }: AuthenticatedContext,
  applicationId: string,
  kind: DocumentKind,
  version: number,
): Promise<StudioDocument> {
  const { data, error } = await supabase
    .from("application_documents")
    .select("*")
    .eq("user_id", userId)
    .eq("application_id", applicationId)
    .eq("kind", kind)
    .eq("version", version)
    .maybeSingle();
  if (error) throw new RepositoryError("Failed to load document version", { cause: error });
  const doc = data ? documentFromRow(data) : null;
  if (!doc) throw new UserFacingError("That version no longer exists.");
  return doc;
}

export async function saveDocumentVersion(
  { supabase }: AuthenticatedContext,
  input: {
    applicationId: string;
    kind: DocumentKind;
    title: string;
    content: string;
    source: DbEnum<"answer_source">;
    model: string | null;
    promptVersionId: string | null;
    groundingFlags: string[];
  },
): Promise<number> {
  const { data, error } = await supabase.rpc("save_application_document", {
    p_application_id: input.applicationId,
    p_kind: input.kind,
    p_title: input.title,
    p_content: input.content,
    p_source: input.source,
    p_model: input.model,
    p_prompt_version_id: input.promptVersionId,
    p_grounding_flags: input.groundingFlags,
  });
  if (error) throwRpcError("save document", error);
  return data;
}

export async function setApplicationResume({ supabase, userId }: AuthenticatedContext, applicationId: string, resumeId: string | null) {
  const { data, error } = await supabase
    .from("applications")
    .update({ resume_id: resumeId })
    .eq("id", applicationId)
    .eq("user_id", userId)
    .select("id");
  assertMutation("set application resume", error, { affected: data });
}

export async function markApplicationReady({ supabase }: AuthenticatedContext, applicationId: string, confirmFlags: boolean) {
  const { error } = await supabase.rpc("mark_application_ready", {
    p_application_id: applicationId,
    p_confirm_flags: confirmFlags,
  });
  if (!error) return;
  if (error.code === "P0001") throw new UserFacingError("Some documents have unconfirmed warnings. Fix them or confirm they are accurate.");
  throwRpcError("mark application ready", error);
}

// --- Screening answers --------------------------------------------------------------

function answerFromRow(row: Tables<"application_answers">): StudioAnswer {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    source: row.source,
    isVerified: row.is_verified,
    model: row.model,
  };
}

export async function listAnswers({ supabase, userId }: AuthenticatedContext, applicationId: string): Promise<StudioAnswer[]> {
  const { data, error } = await supabase
    .from("application_answers")
    .select("*")
    .eq("user_id", userId)
    .eq("application_id", applicationId)
    .order("created_at");
  if (error) throw new RepositoryError("Failed to load answers", { cause: error });
  return data.map(answerFromRow);
}

export async function getAnswer({ supabase, userId }: AuthenticatedContext, id: string): Promise<StudioAnswer & { applicationId: string }> {
  const { data, error } = await supabase.from("application_answers").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw new RepositoryError("Failed to load answer", { cause: error });
  if (!data) throw new UserFacingError("This question no longer exists. Refresh the page.");
  return { ...answerFromRow(data), applicationId: data.application_id };
}

export async function createAnswer({ supabase, userId }: AuthenticatedContext, applicationId: string, question: string) {
  const { error } = await supabase
    .from("application_answers")
    .insert({ user_id: userId, application_id: applicationId, question, answer: "", source: "user", is_verified: false });
  assertMutation("create answer", error);
}

export async function updateAnswer(
  { supabase, userId }: AuthenticatedContext,
  id: string,
  values: AnswerInput & { source?: DbEnum<"answer_source">; model?: string | null; promptVersionId?: string | null },
) {
  const { data, error } = await supabase
    .from("application_answers")
    .update({
      question: values.question,
      answer: values.answer,
      is_verified: values.isVerified,
      ...(values.source ? { source: values.source } : {}),
      ...(values.model !== undefined ? { model: values.model } : {}),
      ...(values.promptVersionId !== undefined ? { prompt_version_id: values.promptVersionId } : {}),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  assertMutation("update answer", error, { affected: data });
}

export async function deleteAnswer({ supabase, userId }: AuthenticatedContext, id: string) {
  const { data, error } = await supabase.from("application_answers").delete().eq("id", id).eq("user_id", userId).select("id");
  assertMutation("delete answer", error, { affected: data });
}
