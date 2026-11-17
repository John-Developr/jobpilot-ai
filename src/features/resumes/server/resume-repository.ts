import "server-only";
import type { AuthenticatedContext } from "@/server/auth";
import { assertMutation, RepositoryError, UserFacingError } from "@/server/errors";
import type { Tables } from "@/types/database";
import { emptyToNull, nullToEmpty } from "@/features/profile/convert";
import {
  isResumeMimeType,
  MAX_RESUME_BYTES,
  RESUME_MIME_TYPES,
  type ResumeInput,
  type ResumeMimeType,
} from "../schemas";

const BUCKET = "documents";
const DOWNLOAD_URL_TTL_SECONDS = 60;

export interface Resume extends ResumeInput {
  id: string;
  isDefault: boolean;
  file: { mimeType: string; sizeBytes: number } | null;
  updatedAt: string;
}

function fromRow(row: Tables<"resumes">): Resume {
  return {
    id: row.id,
    name: row.name,
    targetCategory: nullToEmpty(row.target_category),
    summary: nullToEmpty(row.summary),
    emphasizedSkills: row.emphasized_skills,
    isDefault: row.is_default,
    file:
      row.storage_path && row.mime_type && row.file_size_bytes
        ? { mimeType: row.mime_type, sizeBytes: row.file_size_bytes }
        : null,
    updatedAt: row.updated_at,
  };
}

function toRow(input: ResumeInput) {
  return {
    name: input.name,
    target_category: emptyToNull(input.targetCategory),
    summary: emptyToNull(input.summary),
    emphasized_skills: input.emphasizedSkills,
  };
}

/** Every file of a resume lives under this prefix; RLS on storage enforces the user folder. */
const resumeFolder = (userId: string, resumeId: string) => `${userId}/resumes/${resumeId}/`;

async function getRow({ supabase, userId }: AuthenticatedContext, id: string): Promise<Tables<"resumes">> {
  const { data, error } = await supabase.from("resumes").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new RepositoryError("Failed to load resume", { cause: error });
  if (!data) throw new UserFacingError("This resume no longer exists. Refresh the page.");
  return data;
}

export async function listResumes({ supabase, userId }: AuthenticatedContext): Promise<Resume[]> {
  const { data, error } = await supabase
    .from("resumes")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw new RepositoryError("Failed to load resumes", { cause: error });
  return data.map(fromRow);
}

/** The first resume a user creates becomes their default. */
export async function createResume(ctx: AuthenticatedContext, input: ResumeInput): Promise<void> {
  const { supabase, userId } = ctx;
  const { count, error: countError } = await supabase
    .from("resumes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countError) throw new RepositoryError("Failed to count resumes", { cause: countError });

  const { error } = await supabase
    .from("resumes")
    .insert({ user_id: userId, ...toRow(input), is_default: (count ?? 0) === 0 });
  assertMutation("create resume", error);
}

export async function updateResume({ supabase, userId }: AuthenticatedContext, id: string, input: ResumeInput) {
  const { data, error } = await supabase
    .from("resumes")
    .update(toRow(input))
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  assertMutation("update resume", error, { affected: data });
}

export async function setDefaultResume({ supabase }: AuthenticatedContext, id: string): Promise<void> {
  const { error } = await supabase.rpc("set_default_resume", { p_resume_id: id });
  if (error?.code === "P0002") throw new UserFacingError("This resume no longer exists. Refresh the page.");
  assertMutation("set default resume", error);
}

/** Removes the stored file first so a failed delete never leaves an orphaned object. */
export async function deleteResume(ctx: AuthenticatedContext, id: string): Promise<void> {
  const row = await getRow(ctx, id);
  if (row.storage_path) {
    const { error } = await ctx.supabase.storage.from(BUCKET).remove([row.storage_path]);
    if (error) throw new RepositoryError("Failed to delete resume file", { cause: error });
  }
  const { data, error } = await ctx.supabase
    .from("resumes")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .select("id");
  assertMutation("delete resume", error, { affected: data });
}

// --- Files --------------------------------------------------------------------

/** Step 1: a short-lived signed URL the browser uploads to directly (no server body-size limit). */
export async function prepareResumeUpload(
  ctx: AuthenticatedContext,
  resumeId: string,
  mimeType: ResumeMimeType,
): Promise<{ path: string; token: string }> {
  await getRow(ctx, resumeId);
  const path = `${resumeFolder(ctx.userId, resumeId)}${crypto.randomUUID()}.${RESUME_MIME_TYPES[mimeType]}`;
  const { data, error } = await ctx.supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw new RepositoryError("Failed to create upload URL", { cause: error });
  return { path: data.path, token: data.token };
}

/**
 * Step 2: verify the uploaded object from storage metadata (never trust client-reported
 * type/size), attach it, then delete the previous file.
 */
export async function confirmResumeUpload(ctx: AuthenticatedContext, resumeId: string, path: string): Promise<void> {
  const row = await getRow(ctx, resumeId);
  if (!path.startsWith(resumeFolder(ctx.userId, resumeId)) || path.includes("..")) {
    throw new UserFacingError("Upload path is not valid for this resume.");
  }

  const storage = ctx.supabase.storage.from(BUCKET);
  const { data: info, error: infoError } = await storage.info(path);
  if (infoError) throw new UserFacingError("The upload could not be found. Try again.");

  const mimeType = info.contentType;
  const size = info.size ?? 0;
  if (!isResumeMimeType(mimeType) || size <= 0 || size > MAX_RESUME_BYTES) {
    await storage.remove([path]);
    throw new UserFacingError("Upload a PDF or Word (.docx) file up to 10 MB.");
  }

  const { data, error } = await ctx.supabase
    .from("resumes")
    .update({ storage_path: path, mime_type: mimeType, file_size_bytes: size })
    .eq("id", resumeId)
    .eq("user_id", ctx.userId)
    .select("id");
  assertMutation("attach resume file", error, { affected: data });

  if (row.storage_path && row.storage_path !== path) {
    // Best effort: the row already points at the new file.
    await storage.remove([row.storage_path]);
  }
}

export async function removeResumeFile(ctx: AuthenticatedContext, resumeId: string): Promise<void> {
  const row = await getRow(ctx, resumeId);
  if (!row.storage_path) return;
  const { error: removeError } = await ctx.supabase.storage.from(BUCKET).remove([row.storage_path]);
  if (removeError) throw new RepositoryError("Failed to delete resume file", { cause: removeError });
  const { data, error } = await ctx.supabase
    .from("resumes")
    .update({ storage_path: null, mime_type: null, file_size_bytes: null })
    .eq("id", resumeId)
    .eq("user_id", ctx.userId)
    .select("id");
  assertMutation("detach resume file", error, { affected: data });
}

/** Signed download URL valid for one minute; named after the resume. */
export async function getResumeDownloadUrl(ctx: AuthenticatedContext, resumeId: string): Promise<string | null> {
  const row = await getRow(ctx, resumeId);
  if (!row.storage_path || !isResumeMimeType(row.mime_type)) return null;
  const extension = RESUME_MIME_TYPES[row.mime_type];
  const fileName = `${row.name.replace(/[^\w\- ]+/g, "").trim() || "resume"}.${extension}`;
  const { data, error } = await ctx.supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, DOWNLOAD_URL_TTL_SECONDS, { download: fileName });
  if (error) throw new RepositoryError("Failed to sign resume download", { cause: error });
  return data.signedUrl;
}
