import type { Metadata } from "next";
import Link from "next/link";
import { FileText, PenLine } from "lucide-react";
import { requireUser } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/features/jobs/components/job-badges";
import { ScoreBadge } from "@/features/evaluation/components/score-badge";
import { listStudioApplications } from "@/features/studio/server/studio-repository";

export const metadata: Metadata = { title: "Application Studio" };

export default async function ApplicationStudioPage() {
  const ctx = await requireUser();
  const applications = await listStudioApplications(ctx);

  return (
    <>
      <PageHeader
        title="Application Studio"
        description="Prepare tailored, verified application materials for qualified jobs."
      />
      <SectionCard title="In preparation" icon={PenLine} description="Qualified jobs, drafts, and packages waiting for approval.">
        {applications.length === 0 ? (
          <EmptyState
            icon={PenLine}
            title="Nothing to prepare yet"
            description="Score jobs to qualify them, or open any job and choose “Open in Studio”."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/jobs?sort=score">Browse jobs</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y rounded-lg border">
            {applications.map((app) => (
              <li key={app.application_id}>
                <Link
                  href={`/application-studio/${app.application_id}`}
                  className="flex flex-col gap-1 px-4 py-3 transition-colors duration-150 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{app.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{app.company}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {app.overall_score !== null && app.qualification ? (
                      <ScoreBadge score={app.overall_score} qualification={app.qualification} />
                    ) : null}
                    <StatusBadge status={app.status} />
                    <span className="inline-flex items-center gap-1 text-2xs text-subtle-foreground">
                      <FileText className="size-3" aria-hidden /> {app.documentCount} version{app.documentCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
