import { describe, expect, it } from "vitest";
import {
  bulkSkillsSchema,
  certificationSchema,
  experienceSchema,
  linkSchema,
  preferencesSchema,
  updateOf,
} from "@/features/profile/schemas";
import { isResumeMimeType, prepareUploadSchema } from "@/features/resumes/schemas";

const issues = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.success ? [] : (result.error?.issues.map((issue) => issue.path.join(".")) ?? []);

const experience = {
  company: "Acme",
  title: "iOS Developer",
  location: "",
  employmentType: "full_time" as const,
  remoteType: "" as const,
  startMonth: "2023-07",
  endMonth: "2025-05",
  isCurrent: false,
  description: "",
  achievements: [],
  technologies: ["Swift", "SwiftUI"],
};

describe("experienceSchema", () => {
  it("accepts a finished role", () => {
    expect(experienceSchema.safeParse(experience).success).toBe(true);
  });

  it("accepts a current role without an end month", () => {
    expect(experienceSchema.safeParse({ ...experience, isCurrent: true, endMonth: "" }).success).toBe(true);
  });

  it("requires an end month for a past role", () => {
    expect(issues(experienceSchema.safeParse({ ...experience, endMonth: "" }))).toEqual(["endMonth"]);
  });

  it("rejects an end month on a current role", () => {
    expect(issues(experienceSchema.safeParse({ ...experience, isCurrent: true }))).toEqual(["endMonth"]);
  });

  it("rejects an end before the start", () => {
    expect(issues(experienceSchema.safeParse({ ...experience, endMonth: "2022-01" }))).toEqual(["endMonth"]);
  });

  it("rejects malformed months", () => {
    expect(issues(experienceSchema.safeParse({ ...experience, startMonth: "2023-13" }))).toContain("startMonth");
  });

  it("is idempotent: re-validating parsed output gives the same value", () => {
    const once = experienceSchema.parse({ ...experience, company: "  Acme  " });
    expect(experienceSchema.parse(once)).toEqual(once);
    expect(once.company).toBe("Acme");
  });
});

describe("links and urls", () => {
  it("accepts https URLs", () => {
    expect(linkSchema.safeParse({ label: "Portfolio", url: "https://johndoe.dev" }).success).toBe(true);
  });

  it.each(["javascript:alert(1)", "ftp://example.com", "example.com", "https://"])("rejects %s", (url) => {
    expect(issues(linkSchema.safeParse({ label: "x", url }))).toEqual(["url"]);
  });

  it("allows an empty optional credential URL", () => {
    expect(
      certificationSchema.safeParse({ name: "AWS", issuer: "", issuedMonth: "", expiresMonth: "", credentialUrl: "" })
        .success,
    ).toBe(true);
  });
});

describe("preferencesSchema", () => {
  const preferences = {
    desiredTitles: ["Senior iOS Engineer"],
    preferredLocations: ["Remote"],
    employmentTypes: ["full_time" as const],
    acceptedRemoteTypes: ["remote" as const],
    salaryMin: 100000,
    salaryMax: 150000,
    salaryCurrency: "PHP",
    salaryPeriod: "month" as const,
    willingToRelocate: false,
    notes: "",
  };

  it("accepts valid preferences", () => {
    expect(preferencesSchema.safeParse(preferences).success).toBe(true);
  });

  it("rejects a minimum above the maximum", () => {
    expect(issues(preferencesSchema.safeParse({ ...preferences, salaryMin: 200000 }))).toEqual(["salaryMax"]);
  });

  it("requires at least one employment type and work arrangement", () => {
    expect(issues(preferencesSchema.safeParse({ ...preferences, employmentTypes: [], acceptedRemoteTypes: [] }))).toEqual([
      "employmentTypes",
      "acceptedRemoteTypes",
    ]);
  });

  it("does not accept 'unknown' as a preferred arrangement", () => {
    expect(issues(preferencesSchema.safeParse({ ...preferences, acceptedRemoteTypes: ["unknown"] }))).toEqual([
      "acceptedRemoteTypes.0",
    ]);
  });

  it("requires an ISO currency code", () => {
    expect(issues(preferencesSchema.safeParse({ ...preferences, salaryCurrency: "peso" }))).toEqual(["salaryCurrency"]);
  });
});

describe("update payloads and bulk skills", () => {
  it("wraps values with a uuid", () => {
    const schema = updateOf(linkSchema);
    expect(schema.safeParse({ id: "not-a-uuid", values: { label: "x", url: "https://a.dev" } }).success).toBe(false);
    expect(
      schema.safeParse({ id: "7b0c1f7e-3c55-4b55-9a59-6f0f4f3c2a10", values: { label: "x", url: "https://a.dev" } })
        .success,
    ).toBe(true);
  });

  it("requires at least one bulk skill", () => {
    expect(issues(bulkSkillsSchema.safeParse({ names: [], category: "framework" }))).toEqual(["names"]);
  });
});

describe("resume uploads", () => {
  it("accepts PDF and DOCX only", () => {
    expect(isResumeMimeType("application/pdf")).toBe(true);
    expect(isResumeMimeType("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
    expect(isResumeMimeType("image/png")).toBe(false);
    expect(isResumeMimeType("toString")).toBe(false);
    expect(isResumeMimeType(null)).toBe(false);
  });

  it("rejects files over 10 MB", () => {
    const base = { resumeId: "7b0c1f7e-3c55-4b55-9a59-6f0f4f3c2a10", mimeType: "application/pdf" };
    expect(prepareUploadSchema.safeParse({ ...base, size: 10 * 1024 * 1024 }).success).toBe(true);
    expect(issues(prepareUploadSchema.safeParse({ ...base, size: 10 * 1024 * 1024 + 1 }))).toEqual(["size"]);
  });
});
