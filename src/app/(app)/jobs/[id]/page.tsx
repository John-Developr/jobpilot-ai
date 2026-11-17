import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText, Info, PenLine } from "lucide-react";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ArchiveJobButton, DeleteJobButton } from "@/features/jobs/components/job-actions";
import { EmploymentBadge, RemoteBadge, StatusBadge } from "@/features/jobs/components/job-badges";
import { getJob } from "@/features/jobs/server/job-repository";
import { formatDate, formatSalary } from "@/features/jobs/format";
import { getAutomationSettings } from "@/features/settings/server/automation-settings-repository";
import { JOB_SOURCE_CATALOG, isConnectorKey } from "@/lib/integrations/job-sources/catalog";
import { MatchCard } from "@/features/evaluation/components/match-card";
import { getLatestEvaluation } from "@/features/evaluation/server/evaluation-repository";
import { isAiConfigured } from "@/lib/ai/run-structured";
import { formatDateTime } from "@/features/jobs/format";

export const metadata: Metadata = { title: "Job" };

const ARCHIVABLE = new Set(["discovered", "analyzing", "qualified", "drafting", "pending_approval", "archived"]);

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireUser();
  const [job, settings, evaluation] = await Promise.all([
    getJob(ctx, id),
    getAutomationSettings(ctx),
    getLatestEvaluation(ctx, id),
  ]);
  if (!job) notFound();

  const source = isConnectorKey(job.source_key) ? JOB_SOURCE_CATALOG[job.source_key] : null;
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_currency, job.salary_period);
  const facts = [
    { label: "Location", value: job.location },
    { label: "Salary", value: salary },
    { label: "Posted", value: formatDate(job.posted_at, settings.timezone) },
    { label: "Found", value: formatDate(job.discovered_at, settings.timezone) },
    { label: "Source", value: source?.name ?? null },
  ];

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/jobs">
          <ArrowLeft aria-hidden /> Jobs
        </Link>
      </Button>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{job.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{job.company}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={job.status} />
            <RemoteBadge value={job.remote_type} />
            <EmploymentBadge value={job.employment_type} />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {job.status !== "archived" ? (
            <Button asChild variant="outline">
              <Link href={`/application-studio/${job.application_id}`}>
                <PenLine aria-hidden /> Open in Studio
              </Link>
            </Button>
          ) : null}
          <Button asChild>
            {/* rel without nofollow/noreferrer: Remote OK's terms require a followed link back. */}
            <a href={job.url} target="_blank" rel="noopener">
              View posting <ExternalLink aria-hidden />
            </a>
          </Button>
          {ARCHIVABLE.has(job.status) ? <ArchiveJobButton jobId={job.id} archived={job.status === "archived"} /> : null}
          {ARCHIVABLE.has(job.status) ? <DeleteJobButton jobId={job.id} title={job.title} /> : null}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
        <MatchCard
          jobId={job.id}
          evaluation={evaluation}
          aiReady={isAiConfigured()}
          evaluatedLabel={evaluation ? formatDateTime(evaluation.evaluatedAt, settings.timezone) : null}
        />
        <SectionCard title="Description" icon={FileText}>
          {job.description ? (
            <div className="text-prose whitespace-pre-line">{job.description}</div>
          ) : (
            <EmptyState
              icon={FileText}
              title="No description"
              description="The source did not include one. Open the posting to read it."
            />
          )}
        </SectionCard>
        </div>
        <SectionCard title="Details" icon={Info} className="self-start">
          <dl className="grid gap-3 text-sm">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-2xs text-subtle-foreground uppercase">{fact.label}</dt>
                <dd className="mt-0.5 font-medium">{fact.value ?? "—"}</dd>
              </div>
            ))}
          </dl>
          {source && "attribution" in source ? (
            <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              Listing via{" "}
              <a href={job.url} target="_blank" rel="noopener" className="text-brand-text hover:underline">
                {source.name}
              </a>
              .
            </p>
          ) : null}
        </SectionCard>
      </div>
    </>
  );
}
