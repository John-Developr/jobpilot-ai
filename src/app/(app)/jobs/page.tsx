import type { Metadata } from "next";
import Link from "next/link";
import { BriefcaseBusiness, Plus, RadioTower, SlidersHorizontal } from "lucide-react";
import { requireUser } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { AddJobDialog } from "@/features/jobs/components/add-job-dialog";
import { JobFiltersForm } from "@/features/jobs/components/job-filters";
import { JobsList, JobsPagination } from "@/features/jobs/components/jobs-list";
import { getJobStats, listJobs } from "@/features/jobs/server/job-repository";
import { BatchEvaluateButton } from "@/features/evaluation/components/evaluate-buttons";
import { isAiConfigured } from "@/lib/ai/run-structured";
import { parseJobFilters } from "@/features/jobs/schemas";
import { getAutomationSettings } from "@/features/settings/server/automation-settings-repository";

export const metadata: Metadata = { title: "Jobs" };

export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  const filters = parseJobFilters(await searchParams);
  const ctx = await requireUser();
  const [{ items, total }, settings, stats] = await Promise.all([
    listJobs(ctx, filters),
    getAutomationSettings(ctx),
    getJobStats(ctx, new Date()),
  ]);
  const isFiltered =
    filters.q ||
    filters.location ||
    filters.remote ||
    filters.type ||
    filters.source ||
    filters.level ||
    filters.minSalary !== null ||
    filters.status !== "active";

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Every job discovered by your sources or added by you."
        actions={
          <>
            {isAiConfigured() ? <BatchEvaluateButton unscored={stats.unscored} /> : null}
            <Button asChild variant="outline">
              <Link href="/jobs/sources">
                <RadioTower aria-hidden /> Sources
              </Link>
            </Button>
            <AddJobDialog
              trigger={
                <Button>
                  <Plus aria-hidden /> Add job
                </Button>
              }
            />
          </>
        }
      />
      <div className="flex flex-col gap-5">
        <SectionCard title="Filters" icon={SlidersHorizontal}>
          <JobFiltersForm filters={filters} />
        </SectionCard>
        <SectionCard
          title="Results"
          icon={BriefcaseBusiness}
          action={<span className="text-xs text-muted-foreground tabular-nums">{total} job{total === 1 ? "" : "s"}</span>}
        >
          {items.length > 0 ? (
            <>
              <JobsList items={items} timezone={settings.timezone} />
              <JobsPagination filters={filters} total={total} />
            </>
          ) : isFiltered ? (
            <EmptyState
              icon={BriefcaseBusiness}
              title="No jobs match these filters"
              description="Loosen a filter or reset them to see everything."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/jobs">Reset filters</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={BriefcaseBusiness}
              title="No jobs yet"
              description="Set up a source and sync it, or add a job you found yourself."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/jobs/sources">Set up sources</Link>
                </Button>
              }
            />
          )}
        </SectionCard>
      </div>
    </>
  );
}
