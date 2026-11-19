import type { Metadata } from "next";
import Link from "next/link";
import { Bot, Info } from "lucide-react";
import { requireUser } from "@/server/auth";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { formatDateTime } from "@/features/jobs/format";
import { getAutomationSettings } from "@/features/settings/server/automation-settings-repository";
import { listRuns, type AutomationRun } from "@/features/automation/server/run-repository";
import type { DbEnum } from "@/types/database";

export const metadata: Metadata = { title: "Automation" };

const KIND_LABEL: Record<DbEnum<"run_kind">, string> = {
  discovery: "Job discovery",
  analysis: "Analysis",
  generation: "Generation",
  submission: "Submission",
  maintenance: "Maintenance",
};

const STATUS: Record<DbEnum<"run_status">, { label: string; className: string }> = {
  queued: { label: "Queued", className: "bg-muted text-muted-foreground" },
  running: { label: "Running", className: "bg-info-soft text-info" },
  succeeded: { label: "Succeeded", className: "bg-success-soft text-success" },
  failed: { label: "Failed", className: "bg-destructive-soft text-destructive" },
  needs_attention: { label: "Needs attention", className: "bg-warning-soft text-warning" },
  cancelled: { label: "Postponed", className: "bg-muted text-muted-foreground" },
};

function duration(run: AutomationRun): string | null {
  if (!run.startedAt || !run.finishedAt) return null;
  const seconds = Math.max(0, Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default async function AutomationPage() {
  const ctx = await requireUser();
  const [settings, runs] = await Promise.all([getAutomationSettings(ctx), listRuns(ctx)]);
  const at = (iso: string | null) => formatDateTime(iso, settings.timezone);

  return (
    <>
      <PageHeader
        title="Automation"
        description="Background runs: scheduled job discovery and submissions."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings">Automation settings</Link>
          </Button>
        }
      />

      <Alert className="mb-5">
        <Info aria-hidden />
        <AlertTitle>How background runs work</AlertTitle>
        <AlertDescription>
          Once the background worker is deployed, your enabled job sources sync every 6 hours. Automated submission only
          runs for job sites JobPilot has a form adapter for, and none are enabled yet, so approved applications still
          wait for you. Submissions also need automation switched on in Settings and run only inside your submission
          window.
        </AlertDescription>
      </Alert>

      <SectionCard title="Run history" icon={Bot} description="The latest 50 runs, newest first.">
        {runs.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="No background runs yet"
            description="Runs appear here after the worker's first scheduled discovery or submission."
          />
        ) : (
          <ul className="divide-y rounded-lg border">
            {runs.map((run) => {
              const status = STATUS[run.status];
              const took = duration(run);
              return (
                <li key={run.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {KIND_LABEL[run.kind]}
                      {run.target ? <span className="font-normal text-muted-foreground"> · {run.target}</span> : null}
                    </p>
                    <p className="text-xs text-subtle-foreground tabular-nums">
                      {at(run.startedAt ?? run.createdAt)}
                      {took ? ` · ${took}` : ""}
                      {run.kind === "submission" ? ` · attempt ${run.attempt}` : ""}
                    </p>
                    {run.errorMessage || run.summary ? (
                      <p className="mt-1 text-xs text-muted-foreground">{run.errorMessage ?? run.summary}</p>
                    ) : null}
                  </div>
                  <span
                    className={cn("inline-flex w-fit items-center rounded-md px-2 py-0.5 text-xs font-semibold", status.className)}
                  >
                    {status.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
