import { skillKey } from "@/features/profile/portfolio-mapping";
import type { Certification, Education, Experience, Project, Skill } from "@/features/profile/server/career-repository";
import type { PersonalInfoInput } from "@/features/profile/schemas";

/*
 * Builds the compact, verified CANDIDATE and JOB blocks sent to the model, and the
 * grounding check that keeps AI "matched skills" inside the verified profile. Pure.
 */

const MAX_JOB_DESCRIPTION = 12_000;
const MAX_FIELD = 1_500;

const cut = (text: string, max = MAX_FIELD) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const compact = <T extends Record<string, unknown>>(object: T) =>
  Object.fromEntries(
    Object.entries(object).filter(
      ([, value]) => value !== null && value !== "" && !(Array.isArray(value) && value.length === 0),
    ),
  );

export interface CandidateInput {
  personal: PersonalInfoInput;
  experiences: Experience[];
  skills: Skill[];
  education: Education[];
  certifications: Certification[];
  projects: Project[];
}

export function buildCandidateFacts(input: CandidateInput) {
  return compact({
    headline: input.personal.headline,
    summary: cut(input.personal.summary),
    years_of_experience: input.personal.yearsOfExperience,
    skills: input.skills.map((s) =>
      compact({
        name: s.name,
        category: s.category,
        proficiency_1_to_5: s.proficiency,
        years: s.yearsOfExperience,
        primary: s.isPrimary || null,
      }),
    ),
    experience: input.experiences.map((e) =>
      compact({
        title: e.title,
        company: e.company,
        from: e.startMonth,
        to: e.isCurrent ? "present" : e.endMonth,
        description: cut(e.description),
        achievements: e.achievements,
        technologies: e.technologies,
      }),
    ),
    education: input.education.map((e) => compact({ institution: e.institution, degree: e.degree, field: e.fieldOfStudy, to: e.endMonth })),
    certifications: input.certifications.map((c) => compact({ name: c.name, issuer: c.issuer })),
    projects: input.projects.map((p) =>
      compact({ name: p.name, role: p.role, description: cut(p.description, 600), technologies: p.technologies }),
    ),
  });
}

export interface JobInput {
  title: string;
  company: string;
  location: string | null;
  description: string | null;
}

export function buildJobFacts(job: JobInput) {
  return compact({
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description ? cut(job.description, MAX_JOB_DESCRIPTION) : "(no description provided)",
  });
}

/** Every skill name the candidate can verifiably claim: skills plus technologies used in roles and projects. */
export function verifiedSkillVocabulary(input: Pick<CandidateInput, "skills" | "experiences" | "projects">): Set<string> {
  const names = [
    ...input.skills.map((s) => s.name),
    ...input.experiences.flatMap((e) => e.technologies),
    ...input.projects.flatMap((p) => p.technologies),
  ];
  return new Set(names.map(skillKey).filter(Boolean));
}

/** Drops AI-claimed matches that are not in the verified profile (no invented skills). */
export function groundMatchedSkills(matched: string[], vocabulary: Set<string>): { kept: string[]; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const skill of matched) {
    const key = skillKey(skill);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    (vocabulary.has(key) ? kept : dropped).push(skill.trim());
  }
  return { kept, dropped };
}
