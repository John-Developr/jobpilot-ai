import { describe, expect, it } from "vitest";
import {
  canonicalUrl,
  cleanText,
  detectRemoteType,
  fingerprintSource,
  htmlToText,
  matchesKeywords,
  parseEmploymentType,
  parseSalaryPeriod,
  sanitizeSalary,
  toIsoDate,
} from "@/lib/integrations/job-sources/normalize";

describe("canonicalUrl", () => {
  it("strips tracking parameters, fragments and trailing slashes; lowercases the host", () => {
    expect(
      canonicalUrl("http://remoteOK.com/remote-jobs/123/?utm_source=x&ref=abc&gh_src=1&b=2&a=1#apply"),
    ).toBe("https://remoteok.com/remote-jobs/123?a=1&b=2");
  });

  it("treats URLs differing only by tracking params as equal", () => {
    expect(canonicalUrl("https://jobs.lever.co/acme/1?lever-source=LinkedIn")).toBe(
      canonicalUrl("https://jobs.lever.co/acme/1"),
    );
  });

  it("throws on invalid URLs", () => {
    expect(() => canonicalUrl("not a url")).toThrow();
  });
});

describe("htmlToText", () => {
  it("keeps paragraphs and bullets readable", () => {
    expect(htmlToText("<p>Intro &amp; more</p><ul><li>One</li><li>Two</li></ul><script>x()</script>")).toBe(
      "Intro & more\n\n• One\n• Two",
    );
  });

  it("decodes entity-escaped HTML", () => {
    expect(htmlToText("&lt;p&gt;Hello&lt;br&gt;world&lt;/p&gt;")).toBe("Hello\nworld");
  });

  it("returns null for empty input and caps long text", () => {
    expect(htmlToText("<p> </p>")).toBeNull();
    expect(htmlToText(`<p>${"a".repeat(25_000)}</p>`)?.length).toBe(20_000);
  });
});

describe("classification", () => {
  it.each([
    ["Full-time", "full_time"],
    ["FullTime", "full_time"],
    ["full_time", "full_time"],
    ["Part time", "part_time"],
    ["Contract", "contract"],
    ["Contractor", "contract"],
    ["Internship", "internship"],
    ["Temporary", "temporary"],
    ["Freelance", "freelance"],
    ["Volunteer", null],
  ])("employment type %s → %s", (input, expected) => {
    expect(parseEmploymentType(input)).toBe(expected);
  });

  it("prefers explicit workplace type, then infers from text", () => {
    expect(detectRemoteType("OnSite", "Remote, US")).toBe("onsite");
    expect(detectRemoteType("hybrid")).toBe("hybrid");
    expect(detectRemoteType(null, "Remote, United States")).toBe("remote");
    expect(detectRemoteType(null, "Anywhere in the World")).toBe("remote");
    expect(detectRemoteType(null, "Cebu City")).toBe("unknown");
  });

  it("parses salary periods", () => {
    expect(parseSalaryPeriod("1 YEAR")).toBe("year");
    expect(parseSalaryPeriod("per-month-salary")).toBe("month");
    expect(parseSalaryPeriod("HOUR")).toBe("hour");
    expect(parseSalaryPeriod("NONE")).toBeNull();
  });
});

describe("sanitizeSalary", () => {
  it("keeps plausible ranges and normalizes currency", () => {
    expect(sanitizeSalary({ min: 60000, max: 80000, currency: "usd", period: "year" })).toEqual({
      salaryMin: 60000,
      salaryMax: 80000,
      salaryCurrency: "USD",
      salaryPeriod: "year",
    });
  });

  it("swaps inverted ranges", () => {
    expect(sanitizeSalary({ min: 90000, max: 70000, currency: "USD", period: "year" })).toMatchObject({
      salaryMin: 70000,
      salaryMax: 90000,
    });
  });

  it("drops zero, absurd or period-less values", () => {
    const empty = { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null };
    expect(sanitizeSalary({ min: 0, max: 0, currency: "USD", period: "year" })).toEqual(empty);
    expect(sanitizeSalary({ min: 21, max: 21, currency: "USD", period: "year" })).toEqual(empty);
    expect(sanitizeSalary({ min: 114_000_000, max: 140_000_000, currency: "USD", period: "year" })).toEqual(empty);
    expect(sanitizeSalary({ min: 50000, max: 60000, currency: "USD", period: null })).toEqual(empty);
  });
});

describe("matchesKeywords", () => {
  const job = { title: "Senior iOS Engineer (Swift)", tags: ["mobile", "c++"] };

  it("matches whole tokens case-insensitively", () => {
    expect(matchesKeywords(job, ["ios"])).toBe(true);
    expect(matchesKeywords(job, ["SWIFT"])).toBe(true);
    expect(matchesKeywords(job, ["c++"])).toBe(true);
  });

  it("does not match inside other words", () => {
    expect(matchesKeywords({ title: "Game Studios Producer", tags: [] }, ["ios"])).toBe(false);
  });

  it("keeps everything when no keywords are set", () => {
    expect(matchesKeywords(job, [])).toBe(true);
  });
});

describe("misc", () => {
  it("fingerprints ignore case, accents and punctuation", () => {
    expect(fingerprintSource({ company: "Café Inc.", title: "iOS  Engineer", location: "Remote" })).toBe(
      fingerprintSource({ company: "cafe inc", title: "IOS engineer!", location: "remote" }),
    );
  });

  it("cleans text and dates", () => {
    expect(cleanText("  Senior&nbsp;  Dev \n ")).toBe("Senior Dev");
    expect(cleanText("")).toBeNull();
    expect(toIsoDate(1786469891368)).toMatch(/^2026-/);
    expect(toIsoDate("garbage")).toBeNull();
  });
});
