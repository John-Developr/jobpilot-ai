import { describe, expect, it, vi } from "vitest";
import type { NormalizedJob } from "@/lib/integrations/job-sources/types";
import { manualJobSchema, parseJobFilters, sanitizeSearchTerm } from "@/features/jobs/schemas";
import { formatSalary } from "@/features/jobs/format";

vi.mock("server-only", () => ({}));
const { selectJobsForIngest } = await import("@/features/jobs/server/ingestion-service");

const job = (overrides: Partial<NormalizedJob> = {}): NormalizedJob => ({
  externalId: "1",
  url: "https://example.com/jobs/1?utm_source=x",
  title: "Senior iOS Engineer",
  company: "Acme",
  location: "Remote",
  remoteType: "remote",
  employmentType: "full_time",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  salaryPeriod: null,
  description: null,
  postedAt: "2026-11-01T00:00:00.000Z",
  tags: [],
  ...overrides,
});

describe("selectJobsForIngest", () => {
  it("keeps keyword matches, canonicalizes URLs and sorts newest first", () => {
    const { selected, invalid } = selectJobsForIngest(
      [
        job({ externalId: "a", postedAt: "2026-10-01T00:00:00.000Z" }),
        job({ externalId: "b", title: "Account Executive" }),
        job({ externalId: "c", postedAt: "2026-11-10T00:00:00.000Z" }),
      ],
      ["ios"],
    );
    expect(selected.map((j) => j.externalId)).toEqual(["c", "a"]);
    expect(selected[0]?.url).toBe("https://example.com/jobs/1");
    expect(invalid).toBe(0);
  });

  it("counts invalid jobs instead of failing", () => {
    const { selected, invalid } = selectJobsForIngest([job({ url: "not a url" }), job({ title: "" })], []);
    expect(selected).toEqual([]);
    expect(invalid).toBe(2);
  });

  it("caps a sync at 500 jobs", () => {
    const many = Array.from({ length: 520 }, (_, i) => job({ externalId: String(i), url: `https://e.com/${i}` }));
    expect(selectJobsForIngest(many, []).selected).toHaveLength(500);
  });
});

describe("job filters", () => {
  it("parses search params and falls back on invalid values", () => {
    expect(
      parseJobFilters({ q: " ios ", remote: "remote", type: "nope", minSalary: "abc", status: "x", page: "-3", source: "lever" }),
    ).toEqual({
      q: "ios",
      location: "",
      remote: "remote",
      type: "",
      source: "lever",
      minSalary: null,
      status: "active",
      level: "",
      sort: "newest",
      page: 1,
    });
  });

  it("strips PostgREST syntax from search terms but keeps tech names", () => {
    expect(sanitizeSearchTerm('ios,title.eq.x)"%_')).toBe("ios title.eq.x");
    expect(sanitizeSearchTerm("C# / C++ & Node.js")).toBe("C# / C++ & Node.js");
  });
});

describe("manualJobSchema", () => {
  const base = {
    url: "https://jobs.example.com/1",
    title: "iOS Dev",
    company: "Acme",
    location: "",
    remoteType: "unknown" as const,
    employmentType: "" as const,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: "" as const,
    salaryPeriod: "" as const,
    description: "",
  };

  it("accepts a minimal job", () => {
    expect(manualJobSchema.safeParse(base).success).toBe(true);
  });

  it("requires currency and period when a salary is given", () => {
    const result = manualJobSchema.safeParse({ ...base, salaryMin: 50000 });
    expect(result.success ? [] : result.error.issues.map((i) => i.path.join("."))).toEqual(["salaryPeriod"]);
  });
});

describe("formatSalary", () => {
  it("formats ranges, single values and open ends", () => {
    expect(formatSalary(60000, 80000, "USD", "year")).toBe("USD 60K–80K per year");
    expect(formatSalary(150000, null, "PHP", "month")).toBe("From PHP 150K per month");
    expect(formatSalary(null, null, null, null)).toBeNull();
    expect(formatSalary(25, 25, "USD", "hour")).toBe("USD 25 per hour");
  });
});
