import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CircleAlert, PenLine, RadioTower } from "lucide-react";
import { requireUser } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { SourceSettingsForm, SyncSourceButton } from "@/features/jobs/components/source-card";
import { listSourceStates } from "@/features/jobs/server/source-repository";
import { formatDateTime } from "@/features/jobs/format";
import { getAutomationSettings } from "@/features/settings/server/automation-settings-repository";
import { JOB_SOURCE_CATALOG, SYNC_COOLDOWN_MINUTES, type AutomatedConnectorKey } from "@/lib/integrations/job-sources/catalog";

export const metadata: Metadata = { title: "Job sources" };

export default async function JobSourcesPage() {
  const ctx = await requireUser();
  const [sources, settings] = await Promise.all([listSourceStates(ctx), getAutomationSettings(ctx)]);
  const manual = sources.find((source) => source.key === "manual");
  const automated = sources.filter(
    (source): source is typeof source & { key: AutomatedConnectorKey } => source.key !== "manual",
  );

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/jobs">
          <ArrowLeft aria-hidden /> Jobs
        </Link>
      </Button>
      <PageHeader
        title="Job sources"
        description={`Sources run when you press Sync now (at most every ${SYNC_COOLDOWN_MINUTES} minutes per source). Scheduled syncing arrives with background jobs.`}
      />
      <div className="flex flex-col gap-5">
        {automated.map((source) => {
          const entry = JOB_SOURCE_CATALOG[source.key];
          return (
            <SectionCard
              key={source.key}
              title={entry.name}
              icon={RadioTower}
              description={entry.description}
              action={<SyncSourceButton sourceKey={source.key} disabled={!source.id || !source.isEnabled} />}
            >
              <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Status:{" "}
                  <span className="font-medium text-foreground">
                    {!source.id ? "Not set up" : source.isEnabled ? "Enabled" : "Disabled"}
                  </span>
                </span>
                <span>
                  Last sync:{" "}
                  <span className="font-medium text-foreground">
                    {formatDateTime(source.lastSyncedAt, settings.timezone) ?? "Never"}
                  </span>
                </span>
                <span>
                  Jobs saved: <span className="font-medium text-foreground tabular-nums">{source.jobCount}</span>
                </span>
              </div>
              {source.lastError ? (
                <p role="status" className="mb-4 flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {source.lastError}
                </p>
              ) : null}
              {"attribution" in entry ? <p className="mb-4 text-xs text-muted-foreground">{entry.attribution}</p> : null}
              <SourceSettingsForm source={source} />
            </SectionCard>
          );
        })}
        <SectionCard title={JOB_SOURCE_CATALOG.manual.name} icon={PenLine} description={JOB_SOURCE_CATALOG.manual.description}>
          <p className="text-sm text-muted-foreground">
            {manual?.jobCount ?? 0} job{manual?.jobCount === 1 ? "" : "s"} added manually. Use <span className="font-medium text-foreground">Add job</span> on the Jobs page.
          </p>
        </SectionCard>
      </div>
    </>
  );
}
