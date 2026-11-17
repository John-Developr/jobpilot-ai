import "server-only";
import type { AuthenticatedContext } from "@/server/auth";
import { assertMutation, RepositoryError } from "@/server/errors";
import type { Tables } from "@/types/database";
import { emptyToNull, nullToEmpty } from "../convert";
import type { LinkInput, PersonalInfoInput, PreferencesInput } from "../schemas";

// --- Personal information -----------------------------------------------------

export interface PersonalInfo extends PersonalInfoInput {
  email: string;
}

export async function getPersonalInfo({ supabase, userId }: AuthenticatedContext): Promise<PersonalInfo> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw new RepositoryError("Failed to load profile", { cause: error });
  if (!data) throw new RepositoryError("Profile row is missing for this user");
  return {
    email: nullToEmpty(data.email),
    fullName: nullToEmpty(data.full_name),
    headline: nullToEmpty(data.headline),
    phone: nullToEmpty(data.phone),
    location: nullToEmpty(data.location),
    yearsOfExperience: data.years_of_experience,
    summary: nullToEmpty(data.summary),
  };
}

export async function updatePersonalInfo(
  { supabase, userId }: AuthenticatedContext,
  input: PersonalInfoInput,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: input.fullName,
      headline: emptyToNull(input.headline),
      phone: emptyToNull(input.phone),
      location: emptyToNull(input.location),
      years_of_experience: input.yearsOfExperience,
      summary: emptyToNull(input.summary),
    })
    .eq("id", userId);
  if (error) throw new RepositoryError("Failed to update profile", { cause: error });
}

// --- Links --------------------------------------------------------------------

export interface ProfileLink extends LinkInput {
  id: string;
  fromPortfolio: boolean;
}

export async function listLinks({ supabase, userId }: AuthenticatedContext): Promise<ProfileLink[]> {
  const { data, error } = await supabase
    .from("profile_links")
    .select("id, label, url, portfolio_ref")
    .eq("user_id", userId)
    .order("sort_order")
    .order("created_at");
  if (error) throw new RepositoryError("Failed to load links", { cause: error });
  return data.map((row) => ({ id: row.id, label: row.label, url: row.url, fromPortfolio: row.portfolio_ref !== null }));
}

export async function createLink({ supabase, userId }: AuthenticatedContext, input: LinkInput): Promise<void> {
  const { error } = await supabase.from("profile_links").insert({ user_id: userId, ...input });
  assertMutation("create link", error);
}

export async function updateLink(
  { supabase, userId }: AuthenticatedContext,
  id: string,
  input: LinkInput,
): Promise<void> {
  const { data, error } = await supabase
    .from("profile_links")
    .update(input)
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  assertMutation("update link", error, { affected: data });
}

// --- Job preferences ----------------------------------------------------------

function preferencesFromRow(row: Tables<"job_preferences">): PreferencesInput {
  return {
    desiredTitles: row.desired_titles,
    preferredLocations: row.preferred_locations,
    employmentTypes: row.employment_types,
    acceptedRemoteTypes: row.accepted_remote_types.filter(
      (type): type is Exclude<typeof type, "unknown"> => type !== "unknown",
    ),
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    salaryCurrency: row.salary_currency.trim(),
    salaryPeriod: row.salary_period,
    willingToRelocate: row.willing_to_relocate,
    notes: nullToEmpty(row.notes),
  };
}

export async function getPreferences({ supabase, userId }: AuthenticatedContext): Promise<PreferencesInput> {
  const { data, error } = await supabase.from("job_preferences").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new RepositoryError("Failed to load job preferences", { cause: error });
  if (!data) throw new RepositoryError("Job preferences row is missing for this user");
  return preferencesFromRow(data);
}

export async function updatePreferences(
  { supabase, userId }: AuthenticatedContext,
  input: PreferencesInput,
): Promise<void> {
  const { error } = await supabase
    .from("job_preferences")
    .update({
      desired_titles: input.desiredTitles,
      preferred_locations: input.preferredLocations,
      employment_types: input.employmentTypes,
      accepted_remote_types: input.acceptedRemoteTypes,
      salary_min: input.salaryMin,
      salary_max: input.salaryMax,
      salary_currency: input.salaryCurrency,
      salary_period: input.salaryPeriod,
      willing_to_relocate: input.willingToRelocate,
      notes: emptyToNull(input.notes),
    })
    .eq("user_id", userId);
  if (error) throw new RepositoryError("Failed to update job preferences", { cause: error });
}

// --- Completeness -------------------------------------------------------------

export interface ProfileCompleteness {
  hasBasics: boolean;
  experienceCount: number;
  skillCount: number;
  educationCount: number;
  projectCount: number;
  resumeCount: number;
}

export async function getProfileCompleteness(ctx: AuthenticatedContext): Promise<ProfileCompleteness> {
  const { supabase, userId } = ctx;
  const count = async (
    table: "professional_experiences" | "professional_skills" | "education" | "projects" | "resumes",
  ): Promise<number> => {
    const { count: total, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) throw new RepositoryError(`Failed to count ${table}`, { cause: error });
    return total ?? 0;
  };

  const [profile, experienceCount, skillCount, educationCount, projectCount, resumeCount] = await Promise.all([
    getPersonalInfo(ctx),
    count("professional_experiences"),
    count("professional_skills"),
    count("education"),
    count("projects"),
    count("resumes"),
  ]);

  return {
    hasBasics: Boolean(profile.fullName && profile.headline && profile.summary),
    experienceCount,
    skillCount,
    educationCount,
    projectCount,
    resumeCount,
  };
}
