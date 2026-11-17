import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  companyNameFromToken,
  parseAshby,
  parseGreenhouse,
  parseLever,
  parseRemoteOk,
} from "@/lib/integrations/job-sources/connectors";
import { normalizedJobSchema } from "@/lib/integrations/job-sources/types";

/** Fixtures are trimmed real responses captured on 2026-11-17. */
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../fixtures/job-sources", name), "utf8"));

describe("Remote OK", () => {
  const { jobs, skipped } = parseRemoteOk(fixture("remoteok.json"));

  it("skips the legal notice and parses every job", () => {
    expect(jobs).toHaveLength(3);
    expect(skipped).toBe(0);
  });

  it("produces valid normalized jobs marked remote", () => {
    for (const job of jobs) expect(normalizedJobSchema.safeParse(job).success).toBe(true);
    expect(jobs.every((job) => job.remoteType === "remote")).toBe(true);
    expect(jobs[0]).toMatchObject({
      externalId: "1137796",
      title: "Global Partnerships BD Lead",
      company: "Fuku",
      location: "Paris",
    });
  });

  it("drops zero and implausible salaries instead of storing them", () => {
    expect(jobs[0]).toMatchObject({ salaryMin: null, salaryMax: null, salaryCurrency: null });
    // 114,000,000–140,000,000 and 21–21 USD/year in the real feed.
    expect(jobs[1]).toMatchObject({ salaryMin: null, salaryMax: null });
    expect(jobs[2]).toMatchObject({ salaryMin: null, salaryMax: null });
  });

  it("converts HTML descriptions to text", () => {
    expect(jobs[0]?.description).not.toMatch(/<[a-z]/i);
    expect(jobs[0]?.description).toContain("About the Role");
  });
});

describe("Greenhouse", () => {
  const { jobs } = parseGreenhouse(fixture("greenhouse.json"), "gitlab");

  it("uses the company name from the API and detects remote from location", () => {
    expect(jobs[0]).toMatchObject({
      company: "GitLab",
      title: "AI Transformation Owner, CRO",
      location: "Remote, United States",
      remoteType: "remote",
      url: "https://job-boards.greenhouse.io/gitlab/jobs/8638232002",
      postedAt: "2026-07-22T17:38:40.000Z",
    });
  });

  it("decodes entity-escaped HTML content", () => {
    expect(jobs[0]?.description).toMatch(/^GitLab is the intelligent orchestration/);
    expect(jobs[0]?.description).not.toMatch(/&lt;|<div/);
  });

  it("outputs only valid jobs", () => {
    for (const job of jobs) expect(normalizedJobSchema.safeParse(job).success).toBe(true);
  });
});

describe("Lever", () => {
  const { jobs } = parseLever(fixture("lever.json"), "palantir");

  it("maps workplace type, commitment and location", () => {
    expect(jobs[0]).toMatchObject({
      title: "Administrative Business Partner",
      company: "Palantir",
      location: "Singapore, Singapore",
      remoteType: "hybrid",
      employmentType: "full_time",
    });
    expect(jobs[0]?.postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("includes list sections in the description", () => {
    expect(jobs[0]?.description).toContain("Administrative Business Partner (Foundry)");
  });

  it("outputs only valid jobs", () => {
    for (const job of jobs) expect(normalizedJobSchema.safeParse(job).success).toBe(true);
  });
});

describe("Ashby", () => {
  const { jobs } = parseAshby(fixture("ashby.json"), "ashby");

  it("maps employment type, remote and salary components", () => {
    expect(jobs[0]).toMatchObject({
      title: "Engineering Manager - EU",
      employmentType: "full_time",
      remoteType: "remote",
      location: "Remote - European Union",
      salaryMin: 150000,
      salaryMax: 250000,
      salaryCurrency: "EUR",
      salaryPeriod: "year",
    });
  });

  it("outputs only valid jobs", () => {
    for (const job of jobs) expect(normalizedJobSchema.safeParse(job).success).toBe(true);
  });

  it("skips unlisted jobs", () => {
    const payload = { jobs: [{ id: "x", title: "Hidden", jobUrl: "https://jobs.ashbyhq.com/a/x", isListed: false }] };
    expect(parseAshby(payload, "a")).toEqual({ jobs: [], skipped: 1 });
  });
});

describe("robustness", () => {
  it("returns nothing for unexpected payload shapes", () => {
    expect(parseRemoteOk({ error: "x" })).toEqual({ jobs: [], skipped: 0 });
    expect(parseGreenhouse([], "x")).toEqual({ jobs: [], skipped: 0 });
    expect(parseLever({ ok: false }, "x")).toEqual({ jobs: [], skipped: 0 });
    expect(parseAshby(null, "x")).toEqual({ jobs: [], skipped: 0 });
  });

  it("skips malformed items without failing the batch", () => {
    const result = parseLever([{ id: 1 }, { text: "No id" }], "x");
    expect(result).toEqual({ jobs: [], skipped: 2 });
  });

  it("derives display names from board tokens", () => {
    expect(companyNameFromToken("acme-corp")).toBe("Acme Corp");
  });
});
