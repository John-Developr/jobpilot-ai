import { describe, expect, it } from "vitest";
import { buildCandidateFacts, buildJobFacts, groundMatchedSkills, verifiedSkillVocabulary } from "@/features/evaluation/facts";
import { evaluationOutputSchema } from "@/features/evaluation/schemas";
import { renderTemplate } from "@/lib/ai/run-structured";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

const skill = (name: string) => ({
  id: name,
  name,
  category: "framework" as const,
  proficiency: null,
  yearsOfExperience: null,
  isPrimary: false,
  fromPortfolio: false,
});

const experience = {
  id: "e",
  company: "Acme",
  title: "iOS Developer",
  location: "",
  employmentType: "" as const,
  remoteType: "" as const,
  startMonth: "2024-01",
  endMonth: "",
  isCurrent: true,
  description: "",
  achievements: ["Fixed leaks"],
  technologies: ["Objective-C", "Maestro"],
  fromPortfolio: false,
};

describe("candidate facts", () => {
  it("omits empty fields and marks current roles", () => {
    const facts = buildCandidateFacts({
      personal: { fullName: "Jane", headline: "iOS Engineer", phone: "+63 900", location: "Cebu", yearsOfExperience: 5, summary: "" },
      experiences: [experience],
      skills: [skill("Swift")],
      education: [],
      certifications: [],
      projects: [],
    });
    expect(facts).toEqual({
      headline: "iOS Engineer",
      years_of_experience: 5,
      skills: [{ name: "Swift", category: "framework" }],
      experience: [
        {
          title: "iOS Developer",
          company: "Acme",
          from: "2024-01",
          to: "present",
          achievements: ["Fixed leaks"],
          technologies: ["Objective-C", "Maestro"],
        },
      ],
    });
  });

  it("never sends contact details to the model", () => {
    const facts = JSON.stringify(
      buildCandidateFacts({
        personal: { fullName: "Jane Doe", headline: "", phone: "+63 900 111", location: "Cebu", yearsOfExperience: null, summary: "" },
        experiences: [],
        skills: [],
        education: [],
        certifications: [],
        projects: [],
      }),
    );
    expect(facts).not.toContain("Jane Doe");
    expect(facts).not.toContain("+63");
  });

  it("caps long job descriptions", () => {
    const facts = buildJobFacts({ title: "T", company: "C", location: null, description: "x".repeat(20_000) });
    expect(String(facts.description).length).toBe(12_000);
    expect(buildJobFacts({ title: "T", company: "C", location: null, description: null }).description).toMatch(/no description/);
  });
});

describe("grounding", () => {
  const vocabulary = verifiedSkillVocabulary({ skills: [skill("Swift"), skill("Vue")], experiences: [experience], projects: [] });

  it("keeps verified skills (incl. technologies from roles) and drops invented ones", () => {
    expect(groundMatchedSkills(["Swift", "Vue.js", "Maestro", "Kubernetes", "swift"], vocabulary)).toEqual({
      kept: ["Swift", "Vue.js", "Maestro"],
      dropped: ["Kubernetes"],
    });
  });
});

describe("AI output validation", () => {
  const valid = {
    requirements: [{ kind: "skill", description: "Swift", is_required: true, min_years: 3 }],
    technical_skills: { score: 80, reasoning: "Strong" },
    experience: { score: 70, reasoning: "OK" },
    responsibilities: { score: 60, reasoning: "Partial" },
    matched_skills: ["Swift"],
    missing_skills: [],
    experience_gaps: [],
    positive_factors: [],
    negative_factors: [],
    explanation: "Good.",
  };

  it("accepts well-formed output", () => {
    expect(evaluationOutputSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["score above 100", { ...valid, experience: { score: 140, reasoning: "x" } }],
    ["fractional score", { ...valid, experience: { score: 70.5, reasoning: "x" } }],
    ["unknown requirement kind", { ...valid, requirements: [{ kind: "vibes", description: "x", is_required: true, min_years: null }] }],
    ["missing explanation", { ...valid, explanation: undefined }],
    ["null payload", null],
  ])("rejects %s", (_label, output) => {
    expect(evaluationOutputSchema.safeParse(output).success).toBe(false);
  });
});

describe("prompt rendering", () => {
  it("fills placeholders and refuses missing ones", () => {
    expect(renderTemplate("A {{profile}} B {{job}}", { profile: "P", job: "J" })).toBe("A P B J");
    expect(() => renderTemplate("{{profile}} {{job}}", { profile: "P" })).toThrow(/job/);
  });
});
