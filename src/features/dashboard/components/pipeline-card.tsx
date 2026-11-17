import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import type { JobStats } from "@/features/jobs/server/job-repository";

/** Discovery counts from real job records. Application metrics join in later phases. */
export function PipelineCard({ stats }: { stats: JobStats }) {
  const tiles = [
    { label: "Active jobs", value: stats.active, href: "/jobs" },
    { label: "Qualified", value: stats.qualified, href: "/jobs?sort=score" },
    { label: "Not scored", value: stats.unscored, href: "/jobs?level=unscored" },
    { label: "Found this week", value: stats.discoveredThisWeek, href: "/jobs" },
  ];

  return (
    <SectionCard
      title="Pipeline"
      icon={Workflow}
      action={
        stats.total > 0 ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/jobs">
              All jobs <ArrowRight aria-hidden />
            </Link>
          </Button>
        ) : null
      }
    >
      {stats.total === 0 ? (
        <EmptyState
          icon={BriefcaseBusiness}
          title="No jobs discovered yet"
          description="Configure a job source and sync it, or add a job manually."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/jobs/sources">Set up sources</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((tile) => (
            <li key={tile.label}>
              <Link
                href={tile.href}
                className="block rounded-lg border p-4 transition-colors duration-150 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <p className="text-2xs text-subtle-foreground uppercase">{tile.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{tile.value}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
