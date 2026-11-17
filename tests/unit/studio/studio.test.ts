import { describe, expect, it } from "vitest";
import { checkGrounding } from "@/features/studio/grounding";
import { buildSignature, isDocumentKind } from "@/features/studio/documents";
import { skillKey } from "@/features/profile/portfolio-mapping";

const context = {
  vocabulary: new Set(["Swift", "SwiftUI", "PHP", "Vue"].map(skillKey)),
  jobSkillTerms: ["Swift", "Kotlin", "Vue.js", "GraphQL", "kotlin"],
  sourceText: JSON.stringify({
    experience: [{ from: "2024-01", achievements: ["Reduced load times from 2 minutes to 20 seconds", "Built 7+ apps"] }],
    job: "Requires 5+ years of iOS",
  }),
};

describe("checkGrounding", () => {
  it("passes text that only uses verified skills and numbers", () => {
    expect(
      checkGrounding("I built 7+ apps in Swift and Vue.js, cutting load times from 2 minutes to 20 seconds. You ask for 5+ years.", context),
    ).toEqual([]);
  });

  it("flags job skills the candidate does not have, once each", () => {
    expect(checkGrounding("I have shipped Kotlin apps and love kotlin.", context)).toEqual([
      'Mentions "Kotlin", which is not in your verified profile.',
    ]);
  });

  it("does not flag a missing skill that is only a substring", () => {
    expect(checkGrounding("I work with GraphQLite-free stacks.", context)).toEqual([]);
  });

  it("flags numbers that are not in the profile or job", () => {
    expect(checkGrounding("I improved retention by 40% across 12 apps in 2024.", context)).toEqual([
      'The number "40%" does not appear in your profile or the job posting.',
      'The number "12" does not appear in your profile or the job posting.',
    ]);
  });
});

describe("signature", () => {
  it("is added only to letters and emails, with available contact details", () => {
    const contact = { fullName: "Jane Dev", email: "jane@example.com", phone: "", links: ["https://jane.dev"] };
    expect(buildSignature("cover_letter", contact)).toBe("\n\nSincerely,\nJane Dev\njane@example.com · https://jane.dev");
    expect(buildSignature("application_email", contact)).toContain("Best regards,");
    expect(buildSignature("resume_summary", contact)).toBe("");
    expect(buildSignature("cover_letter", { ...contact, fullName: "" })).toBe("");
  });
});

describe("document kinds", () => {
  it("excludes the resume kind (resumes have their own page)", () => {
    expect(isDocumentKind("cover_letter")).toBe(true);
    expect(isDocumentKind("resume")).toBe(false);
  });
});
