import Form from "next/form";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { EMPLOYMENT_TYPE_LABELS, REMOTE_TYPE_LABELS } from "@/config/labels";
import { JOB_SOURCE_CATALOG } from "@/lib/integrations/job-sources/catalog";
import type { JobFilters } from "../schemas";

/** GET form: filters live in the URL, so results are linkable and work without JS. */
export function JobFiltersForm({ filters }: { filters: JobFilters }) {
  return (
    <Form action="/jobs" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="q">Title or company</Label>
        <Input id="q" name="q" type="search" defaultValue={filters.q} placeholder="e.g. iOS, Shopify, GitLab" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="location">Location</Label>
        <Input id="location" name="location" defaultValue={filters.location} placeholder="e.g. Philippines" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="minSalary">Salary at least</Label>
        <Input
          id="minSalary"
          name="minSalary"
          type="number"
          min={0}
          step={1000}
          defaultValue={filters.minSalary ?? ""}
          placeholder="Hides jobs without salary"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="remote">Work arrangement</Label>
        <NativeSelect id="remote" name="remote" defaultValue={filters.remote}>
          <NativeSelectOption value="">Any</NativeSelectOption>
          {Object.entries(REMOTE_TYPE_LABELS).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="type">Employment type</Label>
        <NativeSelect id="type" name="type" defaultValue={filters.type}>
          <NativeSelectOption value="">Any</NativeSelectOption>
          {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="source">Source</Label>
        <NativeSelect id="source" name="source" defaultValue={filters.source}>
          <NativeSelectOption value="">All sources</NativeSelectOption>
          {Object.entries(JOB_SOURCE_CATALOG).map(([value, entry]) => (
            <NativeSelectOption key={value} value={value}>
              {entry.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="status">Show</Label>
        <NativeSelect id="status" name="status" defaultValue={filters.status}>
          <NativeSelectOption value="active">Active</NativeSelectOption>
          <NativeSelectOption value="archived">Archived</NativeSelectOption>
          <NativeSelectOption value="all">All</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="level">Match</Label>
        <NativeSelect id="level" name="level" defaultValue={filters.level}>
          <NativeSelectOption value="">Any</NativeSelectOption>
          <NativeSelectOption value="high_priority">High priority (85+)</NativeSelectOption>
          <NativeSelectOption value="recommended">Recommended (70–84)</NativeSelectOption>
          <NativeSelectOption value="manual_review">Manual review (55–69)</NativeSelectOption>
          <NativeSelectOption value="archive">Low match (&lt;55)</NativeSelectOption>
          <NativeSelectOption value="unscored">Not scored</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sort">Sort by</Label>
        <NativeSelect id="sort" name="sort" defaultValue={filters.sort}>
          <NativeSelectOption value="newest">Newest</NativeSelectOption>
          <NativeSelectOption value="score">Best match</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2 lg:justify-end">
        <Button asChild variant="ghost">
          <Link href="/jobs">Reset</Link>
        </Button>
        <Button type="submit">
          <Search aria-hidden /> Apply filters
        </Button>
      </div>
    </Form>
  );
}
