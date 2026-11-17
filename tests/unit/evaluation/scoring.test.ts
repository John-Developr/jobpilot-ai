import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEIGHTS,
  overallScore,
  parseWeights,
  qualificationFor,
  scoreEmploymentType,
  scoreRemote,
  scoreSalary,
  statusAfterEvaluation,
  type CriteriaScores,
  type JobFacts,
  type PreferenceFacts,
} from "@/features/evaluation/scoring";

const prefs: PreferenceFacts = {
  acceptedRemoteTypes: ["remote"],
  willingToRelocate: false,
  employmentTypes: ["full_time", "contract"],
  salaryMin: 150000,
  salaryMax: null,
  salaryCurrency: "PHP",
  salaryPeriod: "month",
};

const job: JobFacts = {
  remoteType: "remote",
  employmentType: "full_time",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  salaryPeriod: null,
};

describe("deterministic criteria", () => {
  it("scores remote compatibility", () => {
    expect(scoreRemote(job, prefs).score).toBe(100);
    expect(scoreRemote({ ...job, remoteType: "unknown" }, prefs).score).toBe(60);
    expect(scoreRemote({ ...job, remoteType: "hybrid" }, prefs).score).toBe(40);
    expect(scoreRemote({ ...job, remoteType: "onsite" }, prefs).score).toBe(10);
    expect(scoreRemote({ ...job, remoteType: "onsite" }, { ...prefs, willingToRelocate: true }).score).toBe(40);
  });

  it("scores salary only when comparable, converting periods", () => {
    expect(scoreSalary(job, prefs)).toMatchObject({ score: 50 });
    const usd = { ...job, salaryMax: 100000, salaryCurrency: "USD", salaryPeriod: "year" as const };
    expect(scoreSalary(usd, prefs).reasoning).toMatch(/not compared/);
    const yearly = { ...job, salaryMin: 1_500_000, salaryMax: 2_000_000, salaryCurrency: "PHP", salaryPeriod: "year" as const };
    expect(scoreSalary(yearly, prefs).score).toBe(100); // 166,667/month >= 150,000
    expect(scoreSalary({ ...yearly, salaryMax: 1_600_000 }, prefs).score).toBe(60); // 133,333 = 89%
    expect(scoreSalary({ ...yearly, salaryMax: 900_000 }, prefs).score).toBe(20);
    expect(scoreSalary(yearly, { ...prefs, salaryMin: null }).score).toBe(50);
  });

  it("scores employment type", () => {
    expect(scoreEmploymentType(job, prefs).score).toBe(100);
    expect(scoreEmploymentType({ ...job, employmentType: null }, prefs).score).toBe(60);
    expect(scoreEmploymentType({ ...job, employmentType: "internship" }, prefs).score).toBe(20);
  });
});

describe("overall score", () => {
  const all = (score: number): CriteriaScores => ({
    technical_skills: { score, reasoning: "" },
    experience: { score, reasoning: "" },
    responsibilities: { score, reasoning: "" },
    remote: { score, reasoning: "" },
    salary: { score, reasoning: "" },
    employment_type: { score, reasoning: "" },
  });

  it("is a weighted average using the default 30/20/20/15/10/5 weights", () => {
    const criteria = { ...all(0), technical_skills: { score: 100, reasoning: "" } };
    expect(overallScore(criteria, DEFAULT_WEIGHTS)).toBe(30);
    expect(overallScore(all(80), DEFAULT_WEIGHTS)).toBe(80);
  });

  it("normalizes weights that do not sum to 100 and clamps scores", () => {
    const criteria = { ...all(0), experience: { score: 150, reasoning: "" } };
    expect(overallScore(criteria, { ...DEFAULT_WEIGHTS, experience: 40 })).toBe(33); // 100*40/120
  });

  it("falls back to default weights when stored weights are malformed", () => {
    expect(parseWeights({ technical_skills: "x" })).toEqual(DEFAULT_WEIGHTS);
    expect(parseWeights({ ...DEFAULT_WEIGHTS, remote: 0 })).toMatchObject({ remote: 0 });
    expect(parseWeights({ technical_skills: 0, experience: 0, responsibilities: 0, remote: 0, salary: 0, employment_type: 0 })).toEqual(
      DEFAULT_WEIGHTS,
    );
  });
});

describe("qualification", () => {
  it.each([
    [100, "high_priority"],
    [85, "high_priority"],
    [84, "recommended"],
    [70, "recommended"],
    [69, "manual_review"],
    [55, "manual_review"],
    [54, "archive"],
    [0, "archive"],
  ])("%i → %s", (score, level) => {
    expect(qualificationFor(score)).toBe(level);
  });

  it("decides the pipeline status with the user's minimum score", () => {
    expect(statusAfterEvaluation(90, 70)).toBe("qualified");
    expect(statusAfterEvaluation(72, 75)).toBe("discovered"); // recommended but below the user's minimum
    expect(statusAfterEvaluation(60, 50)).toBe("discovered"); // manual review never auto-qualifies
    expect(statusAfterEvaluation(54, 0)).toBe("archived");
  });
});
