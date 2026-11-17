import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { DOCUMENT_CONFIG, isDocumentKind } from "@/features/studio/documents";
import { getDocumentVersion } from "@/features/studio/server/studio-repository";
import { PrintOnLoad } from "./print-on-load";

export const metadata: Metadata = { title: "Print" };

/** Minimal, app-chrome-free page for "Print / Save as PDF" of one document version. */
export default async function PrintDocumentPage({ params, searchParams }: PageProps<"/print/applications/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const kind = typeof query.kind === "string" ? query.kind : "";
  const version = Number(typeof query.version === "string" ? query.version : NaN);
  if (!z.uuid().safeParse(id).success || !isDocumentKind(kind) || !Number.isInteger(version) || version < 1) notFound();

  const ctx = await requireUser();
  let doc;
  try {
    doc = await getDocumentVersion(ctx, id, kind, version);
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl bg-card px-8 py-10 text-card-foreground print:max-w-none print:bg-transparent print:p-0">
      <p className="mb-6 text-2xs text-subtle-foreground print:hidden">
        {DOCUMENT_CONFIG[kind].label} · version {doc.version}. Use your browser&apos;s print dialog and choose “Save as PDF”.
      </p>
      <article className="font-sans text-prose leading-relaxed whitespace-pre-wrap">{doc.content}</article>
      <PrintOnLoad />
    </main>
  );
}
