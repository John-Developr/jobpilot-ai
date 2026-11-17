import "server-only";
import type { AuthenticatedContext } from "@/server/auth";
import {
  listCertifications,
  listEducation,
  listExperiences,
  listProjects,
  listSkills,
  type Experience,
  type Project,
  type Skill,
} from "@/features/profile/server/career-repository";
import { getPersonalInfo, getPreferences, listLinks, type PersonalInfo } from "@/features/profile/server/profile-repository";
import type { PreferencesInput } from "@/features/profile/schemas";
import { buildCandidateFacts, verifiedSkillVocabulary } from "../facts";

/** Everything AI features may know about the candidate, loaded once per request. */
export interface CandidateContext {
  personal: PersonalInfo;
  links: string[];
  experiences: Experience[];
  skills: Skill[];
  projects: Project[];
  preferences: PreferencesInput;
  /** Verified facts sent to the model (no name or contact details). */
  facts: ReturnType<typeof buildCandidateFacts>;
  /** skillKey()s of verified skills and technologies, for grounding checks. */
  vocabulary: Set<string>;
}

export async function loadCandidateContext(ctx: AuthenticatedContext): Promise<CandidateContext> {
  const [personal, links, experiences, skills, education, certifications, projects, preferences] = await Promise.all([
    getPersonalInfo(ctx),
    listLinks(ctx),
    listExperiences(ctx),
    listSkills(ctx),
    listEducation(ctx),
    listCertifications(ctx),
    listProjects(ctx),
    getPreferences(ctx),
  ]);
  const { email, ...personalInfo } = personal;
  return {
    personal,
    links: links.map((link) => link.url),
    experiences,
    skills,
    projects,
    preferences,
    facts: buildCandidateFacts({ personal: personalInfo, experiences, skills, education, certifications, projects }),
    vocabulary: verifiedSkillVocabulary({ skills, experiences, projects }),
  };
}
