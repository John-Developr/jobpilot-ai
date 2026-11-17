"use client";

import { useRef, useTransition } from "react";
import { Download, FileUp, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { confirmResumeUploadAction, prepareResumeUploadAction, removeResumeFileAction } from "../server/actions";
import { MAX_RESUME_BYTES, RESUME_MIME_TYPES } from "../schemas";
import type { Resume } from "../server/resume-repository";

const ACCEPT = Object.keys(RESUME_MIME_TYPES).join(",");

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Upload flow: server issues a signed upload URL for a path inside the user's folder →
 * browser uploads straight to Supabase Storage → server verifies the stored object and
 * attaches it. Files never pass through the Next.js server.
 */
export function ResumeFileControl({ resume }: { resume: Resume }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const upload = (file: File) =>
    startTransition(async () => {
      if (file.size > MAX_RESUME_BYTES) {
        toast.error("Files must be 10 MB or smaller.");
        return;
      }
      const prepared = await prepareResumeUploadAction({ resumeId: resume.id, mimeType: file.type, size: file.size });
      if (!prepared.ok) {
        toast.error(prepared.fieldErrors?.mimeType?.[0] ?? prepared.error);
        return;
      }
      const { error } = await getSupabaseBrowserClient()
        .storage.from("documents")
        .uploadToSignedUrl(prepared.data.path, prepared.data.token, file, { contentType: file.type });
      if (error) {
        toast.error("Upload failed. Check your connection and try again.");
        return;
      }
      const confirmed = await confirmResumeUploadAction({ resumeId: resume.id, path: prepared.data.path });
      if (confirmed.ok) toast.success("File uploaded.");
      else toast.error(confirmed.error);
    });

  const remove = () =>
    startTransition(async () => {
      const result = await removeResumeFileAction({ id: resume.id });
      if (result.ok) toast.success("File removed.");
      else toast.error(result.error);
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) upload(file);
        }}
      />
      {resume.file ? (
        <>
          <span className="text-xs text-muted-foreground">
            {resume.file.mimeType === "application/pdf" ? "PDF" : "DOCX"} · {formatBytes(resume.file.sizeBytes)}
          </span>
          <Button asChild variant="outline" size="sm">
            <a href={`/resumes/${resume.id}/file`}>
              <Download aria-hidden /> Download
            </a>
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => inputRef.current?.click()}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <FileUp aria-hidden />} Replace
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Remove file" disabled={pending} onClick={remove}>
            <X aria-hidden />
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => inputRef.current?.click()}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <FileUp aria-hidden />}
          Upload PDF or DOCX
        </Button>
      )}
    </div>
  );
}
