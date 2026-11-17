import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, MessageSquareText, PenLine } from "lucide-react";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionCard } from "@/components/shared/section-card";
import { isAiConfigured } from "@/lib/ai/run-structured";
import { StatusBadge } from "@/features/jobs/components/job-badges";
import { getJob } from "@/features/jobs/server/job-repository";
import { ScoreBadge } from "@/features/evaluation/components/score-badge";
import { listResumes } from "@/features/resumes/server/resume-repository";
import { getAutomationSettings } from "@/features/settings/server/automation-settings-repository";
import { AnswersPanel } from "@/features/studio/components/answers-panel";
import { DocumentEditor } from "@/features/studio/components/document-editor";
import { MarkReadyButton, ResumePicker } from "@/features/studio/components/workspace-controls";
import { DOCUMENT_CONFIG, DOCUMENT_KINDS } from "@/features/studio/documents";
import { getStudioApplication, listAnswers, listDocuments } from "@/features/studio/server/studio-repository";

export const metadata: Metadata = { title: "Application Studio" };

const fileSafe = (value: string) => value.replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();

export default async function StudioWorkspacePage({ params }: PageProps<"/application-studio/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireUser();
  const application = await getStudioApplication(ctx, id);
  if (!application) notFound();

  const [job, documents, answers, resumes, settings] = await Promise.all([
    getJob(ctx, application.jobId),
    listDocuments(ctx, id),
    listAnswers(ctx, id),
    listResumes(ctx),
    getAutomationSettings(ctx),
  ]);
  if (!job) notFound();

  const aiReady = isAiConfigured();
  const flaggedSections = DOCUMENT_KINDS.filter((kind) => (documents[kind][0]?.groundingFlags.length ?? 0) > 0).map(
    (kind) => DOCUMENT_CONFIG[kind].label,
  );
  const canMarkReady = ["discovered", "qualified", "drafting"].includes(application.status);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/application-studio">
          <ArrowLeft aria-hidden /> Application Studio
        </Link>
      </Button>

      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{job.title}.</h1>
          <p className="mt-1 text-sm text-muted-foreground">{job.company}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={application.status} />
            {job.overall_score !== null && job.qualification ? (
              <ScoreBadge score={job.overall_score} qualification={job.qualification} />
            ) : null}
            <Link href={`/jobs/${job.id}`} className="inline-flex items-center gap-1 text-xs text-brand-text hover:underline">
              Job details <ExternalLink className="size-3" aria-hidden />
            </Link>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <ResumePicker
            applicationId={id}
            resumeId={application.resumeId}
            resumes={resumes.map((r) => ({ id: r.id, name: r.name, isDefault: r.isDefault }))}
          />
          {canMarkReady ? <MarkReadyButton applicationId={id} flaggedSections={flaggedSections} /> : null}
        </div>
      </header>

      <div className="flex flex-col gap-5">
        <SectionCard
          title="Documents"
          icon={PenLine}
          description="Each section is generated, edited and versioned on its own. Contact details are added by the app, never sent to the AI."
        >
          <Tabs defaultValue="cover_letter">
            <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
              {DOCUMENT_KINDS.map((kind) => (
                <TabsTrigger key={kind} value={kind}>
                  {DOCUMENT_CONFIG[kind].label}
                  {documents[kind].length ? (
                    <span className="ml-1 text-2xs text-subtle-foreground tabular-nums">v{documents[kind][0]?.version}</span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
            {DOCUMENT_KINDS.map((kind) => (
              <TabsContent key={kind} value={kind}>
                <DocumentEditor
                  key={documents[kind][0]?.id ?? `${kind}-empty`}
                  applicationId={id}
                  kind={kind}
                  versions={documents[kind]}
                  aiReady={aiReady}
                  timezone={settings.timezone}
                  fileBaseName={fileSafe(`${kind}-${job.company}-${job.title}`)}
                />
              </TabsContent>
            ))}
          </Tabs>
        </SectionCard>

        <SectionCard title="Screening answers" icon={MessageSquareText}>
          <AnswersPanel applicationId={id} answers={answers} aiReady={aiReady} />
        </SectionCard>
      </div>
    </>
  );
}
