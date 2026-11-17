import "server-only";
import type { AuthenticatedContext } from "@/server/auth";
import { assertMutation, RepositoryError, UserFacingError } from "@/server/errors";
import type { Tables } from "@/types/database";
import { dateToMonth, emptyToNull, monthToDate, nullToEmpty } from "../convert";
import type {
  CertificationInput,
  EducationInput,
  ExperienceInput,
  ProfileItemKind,
  ProjectInput,
  SkillInput,
} from "../schemas";

type WithId<T> = T & { id: string };
/** Synced items: portfolio-owned fields are replaced on every sync. */
type Synced<T> = WithId<T> & { fromPortfolio: boolean };

export type Experience = Synced<ExperienceInput>;
export type Skill = Synced<SkillInput>;
export type Education = Synced<EducationInput>;
export type Certification = WithId<CertificationInput>;
export type Project = Synced<ProjectInput>;

function loadFailed(what: string, error: unknown): never {
  throw new RepositoryError(`Failed to load ${what}`, { cause: error });
}

// --- Experience ---------------------------------------------------------------

function experienceFromRow(row: Tables<"professional_experiences">): Experience {
  return {
    id: row.id,
    company: row.company,
    title: row.title,
    location: nullToEmpty(row.location),
    employmentType: row.employment_type ?? "",
    remoteType: row.remote_type ?? "",
    startMonth: dateToMonth(row.start_date),
    endMonth: dateToMonth(row.end_date),
    isCurrent: row.is_current,
    description: nullToEmpty(row.description),
    achievements: row.achievements,
    technologies: row.technologies,
    fromPortfolio: row.portfolio_ref !== null,
  };
}

function experienceToRow(input: ExperienceInput) {
  return {
    company: input.company,
    title: input.title,
    location: emptyToNull(input.location),
    employment_type: input.employmentType || null,
    remote_type: input.remoteType || null,
    start_date: `${input.startMonth}-01`,
    end_date: input.isCurrent ? null : monthToDate(input.endMonth),
    is_current: input.isCurrent,
    description: emptyToNull(input.description),
    achievements: input.achievements,
    technologies: input.technologies,
  };
}

export async function listExperiences({ supabase, userId }: AuthenticatedContext): Promise<Experience[]> {
  const { data, error } = await supabase
    .from("professional_experiences")
    .select("*")
    .eq("user_id", userId)
    .order("is_current", { ascending: false })
    .order("start_date", { ascending: false });
  if (error) loadFailed("experience", error);
  return data.map(experienceFromRow);
}

export async function createExperience({ supabase, userId }: AuthenticatedContext, input: ExperienceInput) {
  const { error } = await supabase
    .from("professional_experiences")
    .insert({ user_id: userId, ...experienceToRow(input) });
  assertMutation("create experience", error);
}

export async function updateExperience({ supabase, userId }: AuthenticatedContext, id: string, input: ExperienceInput) {
  const { data, error } = await supabase
    .from("professional_experiences")
    .update(experienceToRow(input))
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  assertMutation("update experience", error, { affected: data });
}

// --- Skills -------------------------------------------------------------------

function skillFromRow(row: Tables<"professional_skills">): Skill {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    proficiency: row.proficiency,
    yearsOfExperience: row.years_of_experience,
    isPrimary: row.is_primary,
    fromPortfolio: row.portfolio_ref !== null,
  };
}

function skillToRow(input: SkillInput) {
  return {
    name: input.name,
    category: input.category,
    proficiency: input.proficiency,
    years_of_experience: input.yearsOfExperience,
    is_primary: input.isPrimary,
  };
}

const duplicateSkill = (name: string) => `"${name}" is already in your skills.`;

export async function listSkills({ supabase, userId }: AuthenticatedContext): Promise<Skill[]> {
  const { data, error } = await supabase
    .from("professional_skills")
    .select("*")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("name");
  if (error) loadFailed("skills", error);
  return data.map(skillFromRow);
}

export async function createSkill({ supabase, userId }: AuthenticatedContext, input: SkillInput) {
  const { error } = await supabase.from("professional_skills").insert({ user_id: userId, ...skillToRow(input) });
  assertMutation("create skill", error, { duplicateMessage: duplicateSkill(input.name) });
}

/** Inserts many skills in one category; names that already exist (case-insensitive) are skipped. */
export async function createSkills(
  { supabase, userId }: AuthenticatedContext,
  names: string[],
  category: Skill["category"],
): Promise<void> {
  const unique = [...new Map(names.map((name) => [name.toLowerCase(), name])).values()];
  const { error } = await supabase
    .from("professional_skills")
    .upsert(
      unique.map((name) => ({ user_id: userId, name, category })),
      { onConflict: "user_id,name", ignoreDuplicates: true },
    );
  assertMutation("create skills", error);
}

export async function updateSkill({ supabase, userId }: AuthenticatedContext, id: string, input: SkillInput) {
  const { data, error } = await supabase
    .from("professional_skills")
    .update(skillToRow(input))
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  assertMutation("update skill", error, { affected: data, duplicateMessage: duplicateSkill(input.name) });
}

// --- Education ----------------------------------------------------------------

function educationFromRow(row: Tables<"education">): Education {
  return {
    id: row.id,
    institution: row.institution,
    degree: nullToEmpty(row.degree),
    fieldOfStudy: nullToEmpty(row.field_of_study),
    startMonth: dateToMonth(row.start_date),
    endMonth: dateToMonth(row.end_date),
    description: nullToEmpty(row.description),
    fromPortfolio: row.portfolio_ref !== null,
  };
}

function educationToRow(input: EducationInput) {
  return {
    institution: input.institution,
    degree: emptyToNull(input.degree),
    field_of_study: emptyToNull(input.fieldOfStudy),
    start_date: monthToDate(input.startMonth),
    end_date: monthToDate(input.endMonth),
    description: emptyToNull(input.description),
  };
}

export async function listEducation({ supabase, userId }: AuthenticatedContext): Promise<Education[]> {
  const { data, error } = await supabase
    .from("education")
    .select("*")
    .eq("user_id", userId)
    .order("start_date", { ascending: false, nullsFirst: false });
  if (error) loadFailed("education", error);
  return data.map(educationFromRow);
}

export async function createEducation({ supabase, userId }: AuthenticatedContext, input: EducationInput) {
  const { error } = await supabase.from("education").insert({ user_id: userId, ...educationToRow(input) });
  assertMutation("create education", error);
}

export async function updateEducation({ supabase, userId }: AuthenticatedContext, id: string, input: EducationInput) {
  const { data, error } = await supabase
    .from("education")
    .update(educationToRow(input))
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  assertMutation("update education", error, { affected: data });
}

// --- Certifications -----------------------------------------------------------

function certificationFromRow(row: Tables<"certifications">): Certification {
  return {
    id: row.id,
    name: row.name,
    issuer: nullToEmpty(row.issuer),
    issuedMonth: dateToMonth(row.issued_on),
    expiresMonth: dateToMonth(row.expires_on),
    credentialUrl: nullToEmpty(row.credential_url),
  };
}

function certificationToRow(input: CertificationInput) {
  return {
    name: input.name,
    issuer: emptyToNull(input.issuer),
    issued_on: monthToDate(input.issuedMonth),
    expires_on: monthToDate(input.expiresMonth),
    credential_url: emptyToNull(input.credentialUrl),
  };
}

export async function listCertifications({ supabase, userId }: AuthenticatedContext): Promise<Certification[]> {
  const { data, error } = await supabase
    .from("certifications")
    .select("*")
    .eq("user_id", userId)
    .order("issued_on", { ascending: false, nullsFirst: false });
  if (error) loadFailed("certifications", error);
  return data.map(certificationFromRow);
}

export async function createCertification({ supabase, userId }: AuthenticatedContext, input: CertificationInput) {
  const { error } = await supabase.from("certifications").insert({ user_id: userId, ...certificationToRow(input) });
  assertMutation("create certification", error);
}

export async function updateCertification(
  { supabase, userId }: AuthenticatedContext,
  id: string,
  input: CertificationInput,
) {
  const { data, error } = await supabase
    .from("certifications")
    .update(certificationToRow(input))
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  assertMutation("update certification", error, { affected: data });
}

// --- Projects -----------------------------------------------------------------

function projectFromRow(row: Tables<"projects">): Project {
  return {
    id: row.id,
    name: row.name,
    role: nullToEmpty(row.role),
    description: nullToEmpty(row.description),
    url: nullToEmpty(row.url),
    repositoryUrl: nullToEmpty(row.repository_url),
    technologies: row.technologies,
    highlights: row.highlights,
    startMonth: dateToMonth(row.start_date),
    endMonth: dateToMonth(row.end_date),
    fromPortfolio: row.portfolio_ref !== null,
  };
}

function projectToRow(input: ProjectInput) {
  return {
    name: input.name,
    role: emptyToNull(input.role),
    description: emptyToNull(input.description),
    url: emptyToNull(input.url),
    repository_url: emptyToNull(input.repositoryUrl),
    technologies: input.technologies,
    highlights: input.highlights,
    start_date: monthToDate(input.startMonth),
    end_date: monthToDate(input.endMonth),
  };
}

export async function listProjects({ supabase, userId }: AuthenticatedContext): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) loadFailed("projects", error);
  return data.map(projectFromRow);
}

export async function createProject({ supabase, userId }: AuthenticatedContext, input: ProjectInput) {
  const { error } = await supabase.from("projects").insert({ user_id: userId, ...projectToRow(input) });
  assertMutation("create project", error);
}

export async function updateProject({ supabase, userId }: AuthenticatedContext, id: string, input: ProjectInput) {
  const { data, error } = await supabase
    .from("projects")
    .update(projectToRow(input))
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  assertMutation("update project", error, { affected: data });
}

// --- Delete (all profile item kinds) ------------------------------------------

const TABLE_BY_KIND = {
  link: "profile_links",
  experience: "professional_experiences",
  skill: "professional_skills",
  education: "education",
  certification: "certifications",
  project: "projects",
} as const satisfies Record<ProfileItemKind, string>;

export async function deleteProfileItem(
  { supabase, userId }: AuthenticatedContext,
  kind: ProfileItemKind,
  id: string,
): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from(TABLE_BY_KIND[kind])
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw new RepositoryError(`Failed to load ${kind}`, { cause: readError });
  // Certifications are never synced, so they have no portfolio_ref column.
  if (existing && "portfolio_ref" in existing && existing.portfolio_ref) {
    throw new UserFacingError("This item comes from your portfolio. Remove it in your portfolio admin, then sync.");
  }
  const { data, error } = await supabase
    .from(TABLE_BY_KIND[kind])
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  assertMutation(`delete ${kind}`, error, { affected: data });
}
