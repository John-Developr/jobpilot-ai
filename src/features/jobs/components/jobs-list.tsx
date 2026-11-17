import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JOB_SOURCE_CATALOG, isConnectorKey } from "@/lib/integrations/job-sources/catalog";
import type { JobListing } from "../server/job-repository";
import { formatDate, formatSalary } from "../format";
import { JOBS_PAGE_SIZE, type JobFilters } from "../schemas";
import { EmploymentBadge, RemoteBadge, StatusBadge } from "./job-badges";
import { ScoreBadge } from "@/features/evaluation/components/score-badge";

export function JobsList({ items, timezone }: { items: JobListing[]; timezone: string }) {
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((job) => {
        const salary = formatSalary(job.salary_min, job.salary_max, job.salary_currency, job.salary_period);
        const source = isConnectorKey(job.source_key) ? JOB_SOURCE_CATALOG[job.source_key].name : null;
        return (
          <li key={job.id}>
            <Link
              href={`/jobs/${job.id}`}
              className="grid gap-1 px-4 py-3 transition-colors duration-150 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none md:grid-cols-[1fr_auto] md:items-center md:gap-4"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold">{job.title}</span>
                  {job.status !== "discovered" ? <StatusBadge status={job.status} /> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[job.company, job.location].filter(Boolean).join(" · ")}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {job.overall_score !== null && job.qualification ? (
                    <ScoreBadge score={job.overall_score} qualification={job.qualification} />
                  ) : null}
                  <RemoteBadge value={job.remote_type} />
                  <EmploymentBadge value={job.employment_type} />
                  {salary ? <span className="text-2xs font-medium tabular-nums">{salary}</span> : null}
                </div>
              </div>
              <div className="text-2xs text-subtle-foreground md:text-right">
                {source ? <p>{source}</p> : null}
                <p>Found {formatDate(job.discovered_at, timezone)}</p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function pageHref(filters: JobFilters, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (key === "page" || value === "" || value === null) continue;
    if (key === "status" && value === "active") continue;
    if (key === "sort" && value === "newest") continue;
    params.set(key, String(value));
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/jobs?${query}` : "/jobs";
}

export function JobsPagination({ filters, total }: { filters: JobFilters; total: number }) {
  const pages = Math.max(1, Math.ceil(total / JOBS_PAGE_SIZE));
  if (pages <= 1) return null;
  const { page } = filters;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground tabular-nums">
        Page {page} of {pages}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={pageHref(filters, page - 1)}>
              <ChevronLeft aria-hidden /> Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft aria-hidden /> Previous
          </Button>
        )}
        {page < pages ? (
          <Button asChild variant="outline" size="sm">
            <Link href={pageHref(filters, page + 1)}>
              Next <ChevronRight aria-hidden />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next <ChevronRight aria-hidden />
          </Button>
        )}
      </div>
    </nav>
  );
}
