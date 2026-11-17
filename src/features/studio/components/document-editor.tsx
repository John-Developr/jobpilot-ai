"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Copy, Download, History, Loader2, Printer, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/features/jobs/format";
import { DOCUMENT_CONFIG, type DocumentKind } from "../documents";
import { generateDocumentAction, restoreVersionAction, saveDocumentAction } from "../server/actions";
import type { StudioDocument } from "../server/studio-repository";

interface DocumentEditorProps {
  applicationId: string;
  kind: DocumentKind;
  /** Newest first. The parent re-mounts this component (key) when a new version arrives. */
  versions: StudioDocument[];
  aiReady: boolean;
  fileBaseName: string;
  /** User timezone, so server and browser render identical timestamps. */
  timezone: string;
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const flagSummary = (flags: string[]) => (flags.length ? ` ${flags.length} warning${flags.length === 1 ? "" : "s"} to review.` : "");

export function DocumentEditor({ applicationId, kind, versions, aiReady, fileBaseName, timezone }: DocumentEditorProps) {
  const config = DOCUMENT_CONFIG[kind];
  const latest = versions[0] ?? null;
  const [selected, setSelected] = useState<StudioDocument | null>(latest);
  const [text, setText] = useState(latest?.content ?? "");
  const [instructions, setInstructions] = useState("");
  const [pending, startTransition] = useTransition();
  const dirty = text !== (selected?.content ?? "");
  const viewingOld = selected !== null && latest !== null && selected.version !== latest.version;

  const selectVersion = (version: number) => {
    const doc = versions.find((v) => v.version === version) ?? null;
    setSelected(doc);
    setText(doc?.content ?? "");
  };

  const generate = () =>
    startTransition(async () => {
      const result = await generateDocumentAction({ applicationId, kind, instructions });
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Version ${result.data.version} generated.${flagSummary(result.data.flags)}`);
      if (result.data.notes) toast.info(result.data.notes);
    });

  const save = () =>
    startTransition(async () => {
      const result = await saveDocumentAction({ applicationId, kind, content: text });
      if (!result.ok) return void toast.error(result.fieldErrors?.content?.[0] ?? result.error);
      toast.success(`Saved as version ${result.data.version}.${flagSummary(result.data.flags)}`);
    });

  const restore = () =>
    startTransition(async () => {
      if (!selected) return;
      const result = await restoreVersionAction({ applicationId, kind, version: selected.version });
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Version ${selected.version} restored as version ${result.data.version}.`);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-muted-foreground">{config.description}</p>
        {versions.length > 0 ? (
          <div className="grid gap-1.5 sm:w-64">
            <Label htmlFor={`${kind}-version`} className="text-xs">
              Version
            </Label>
            <NativeSelect
              id={`${kind}-version`}
              size="sm"
              value={selected?.version ?? ""}
              onChange={(event) => selectVersion(Number(event.target.value))}
              disabled={pending}
            >
              {versions.map((v) => (
                <NativeSelectOption key={v.id} value={v.version}>
                  v{v.version} · {v.source === "ai" ? "AI" : "Edited"} · {formatDateTime(v.createdAt, timezone)}
                  {v.groundingFlags.length ? " · ⚠" : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ) : null}
      </div>

      {selected && selected.groundingFlags.length > 0 ? (
        <div role="status" className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          <p className="mb-1 flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-3.5" aria-hidden /> Check before using this version
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {selected.groundingFlags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {aiReady ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor={`${kind}-instructions`} className="text-xs">
              Instructions for the AI (optional)
            </Label>
            <Textarea
              id={`${kind}-instructions`}
              rows={2}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="e.g. Keep it under 250 words; highlight the NativeCamp performance work."
              maxLength={1000}
            />
          </div>
          <Button onClick={generate} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {latest ? "Regenerate" : "Generate"}
          </Button>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          AI generation needs GEMINI_API_KEY (or OPENAI_API_KEY). You can still write and version this section yourself.
        </p>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor={`${kind}-content`}>{config.label}</Label>
        <Textarea
          id={`${kind}-content`}
          rows={16}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={latest ? undefined : `No ${config.label.toLowerCase()} yet. Generate one or write it here.`}
          className="text-prose leading-relaxed"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!text}
            onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("Copied."), () => toast.error("Copy failed."))}
          >
            <Copy aria-hidden /> Copy
          </Button>
          <Button variant="ghost" size="sm" disabled={!text} onClick={() => download(`${fileBaseName}.md`, text, "text/markdown")}>
            <Download aria-hidden /> .md
          </Button>
          <Button variant="ghost" size="sm" disabled={!text} onClick={() => download(`${fileBaseName}.txt`, text, "text/plain")}>
            <Download aria-hidden /> .txt
          </Button>
          {selected && !dirty ? (
            <Button asChild variant="ghost" size="sm">
              <a href={`/print/applications/${applicationId}?kind=${kind}&version=${selected.version}`} target="_blank" rel="noopener">
                <Printer aria-hidden /> Print / PDF
              </a>
            </Button>
          ) : null}
        </div>
        <div className="flex gap-2">
          {viewingOld && !dirty ? (
            <Button variant="outline" onClick={restore} disabled={pending}>
              <History aria-hidden /> Restore v{selected?.version}
            </Button>
          ) : null}
          <Button onClick={save} disabled={pending || !dirty || !text.trim()}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            Save as new version
          </Button>
        </div>
      </div>
    </div>
  );
}
