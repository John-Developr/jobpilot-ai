import { z } from "zod";
import { EMPLOYMENT_TYPES, REMOTE_TYPES, SALARY_PERIODS, SKILL_CATEGORIES } from "@/config/labels";

/*
 * Form + Server Action schemas for the professional profile.
 * Schemas are idempotent (no shape-changing transforms): the client validates with them,
 * the Server Action re-validates the same values. Empty optional text is "", and the
 * repository maps "" to NULL.
 */

const text = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters.`);
const requiredText = (max: number) => text(max).min(1, "Required.");

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month.");
const optionalMonth = z.union([z.literal(""), month]);

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .regex(/^https?:\/\/[^\s]+\.[^\s]+$/i, "Enter a full URL starting with https://");
const optionalUrl = z.union([z.literal(""), httpUrl]);

const list = (maxItems: number, maxLength: number) =>
  z
    .array(z.string().trim().min(1).max(maxLength, `Each item must be under ${maxLength} characters.`))
    .max(maxItems, `Up to ${maxItems} items.`);

const optionalNumber = (min: number, max: number) =>
  z
    .number({ error: "Enter a number." })
    .min(min, `Must be at least ${min}.`)
    .max(max, `Must be at most ${max}.`)
    .nullable();

const endNotBeforeStart = (start: string, end: string) => !start || !end || end >= start;
const DATE_ORDER_MESSAGE = "End must be on or after the start.";

/** Update payload: the row id plus the same values the create form submits. */
export const updateOf = <S extends z.ZodType>(values: S) => z.object({ id: z.uuid(), values });

// --- Personal information -----------------------------------------------------

export const personalInfoSchema = z.object({
  fullName: requiredText(120),
  headline: text(160),
  phone: text(40),
  location: text(120),
  yearsOfExperience: optionalNumber(0, 60),
  summary: text(3000),
});
export type PersonalInfoInput = z.infer<typeof personalInfoSchema>;

export const linkSchema = z.object({
  label: requiredText(80),
  url: httpUrl,
});
export type LinkInput = z.infer<typeof linkSchema>;

// --- Experience ---------------------------------------------------------------

export const experienceSchema = z
  .object({
    company: requiredText(120),
    title: requiredText(120),
    location: text(120),
    employmentType: z.union([z.literal(""), z.enum(EMPLOYMENT_TYPES)]),
    remoteType: z.union([z.literal(""), z.enum(REMOTE_TYPES)]),
    startMonth: month,
    endMonth: optionalMonth,
    isCurrent: z.boolean(),
    description: text(4000),
    achievements: list(20, 500),
    technologies: list(40, 60),
  })
  .refine((v) => v.isCurrent || v.endMonth !== "", {
    path: ["endMonth"],
    message: "Add an end month or mark this as your current role.",
  })
  .refine((v) => !v.isCurrent || v.endMonth === "", {
    path: ["endMonth"],
    message: "A current role has no end month.",
  })
  .refine((v) => endNotBeforeStart(v.startMonth, v.endMonth), {
    path: ["endMonth"],
    message: DATE_ORDER_MESSAGE,
  });
export type ExperienceInput = z.infer<typeof experienceSchema>;

// --- Skills -------------------------------------------------------------------

export const skillSchema = z.object({
  name: requiredText(80),
  category: z.enum(SKILL_CATEGORIES),
  proficiency: z.number().int().min(1).max(5).nullable(),
  yearsOfExperience: optionalNumber(0, 60),
  isPrimary: z.boolean(),
});
export type SkillInput = z.infer<typeof skillSchema>;

export const bulkSkillsSchema = z.object({
  names: list(50, 80).min(1, "Add at least one skill."),
  category: z.enum(SKILL_CATEGORIES),
});
export type BulkSkillsInput = z.infer<typeof bulkSkillsSchema>;

// --- Education & certifications -----------------------------------------------

export const educationSchema = z
  .object({
    institution: requiredText(160),
    degree: text(120),
    fieldOfStudy: text(120),
    startMonth: optionalMonth,
    endMonth: optionalMonth,
    description: text(2000),
  })
  .refine((v) => endNotBeforeStart(v.startMonth, v.endMonth), {
    path: ["endMonth"],
    message: DATE_ORDER_MESSAGE,
  });
export type EducationInput = z.infer<typeof educationSchema>;

export const certificationSchema = z
  .object({
    name: requiredText(160),
    issuer: text(120),
    issuedMonth: optionalMonth,
    expiresMonth: optionalMonth,
    credentialUrl: optionalUrl,
  })
  .refine((v) => endNotBeforeStart(v.issuedMonth, v.expiresMonth), {
    path: ["expiresMonth"],
    message: "Expiry must be on or after the issue date.",
  });
export type CertificationInput = z.infer<typeof certificationSchema>;

// --- Projects -----------------------------------------------------------------

export const projectSchema = z
  .object({
    name: requiredText(120),
    role: text(120),
    description: text(4000),
    url: optionalUrl,
    repositoryUrl: optionalUrl,
    technologies: list(40, 60),
    highlights: list(20, 500),
    startMonth: optionalMonth,
    endMonth: optionalMonth,
  })
  .refine((v) => endNotBeforeStart(v.startMonth, v.endMonth), {
    path: ["endMonth"],
    message: DATE_ORDER_MESSAGE,
  });
export type ProjectInput = z.infer<typeof projectSchema>;

// --- Job preferences ----------------------------------------------------------

export const preferencesSchema = z
  .object({
    desiredTitles: list(20, 120),
    preferredLocations: list(20, 120),
    employmentTypes: z.array(z.enum(EMPLOYMENT_TYPES)).min(1, "Pick at least one."),
    acceptedRemoteTypes: z
      .array(z.enum(REMOTE_TYPES).exclude(["unknown"]))
      .min(1, "Pick at least one."),
    salaryMin: optionalNumber(0, 1_000_000_000),
    salaryMax: optionalNumber(0, 1_000_000_000),
    salaryCurrency: z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, e.g. PHP."),
    salaryPeriod: z.enum(SALARY_PERIODS),
    willingToRelocate: z.boolean(),
    notes: text(2000),
  })
  .refine((v) => v.salaryMin === null || v.salaryMax === null || v.salaryMin <= v.salaryMax, {
    path: ["salaryMax"],
    message: "Maximum must be at least the minimum.",
  });
export type PreferencesInput = z.infer<typeof preferencesSchema>;

// --- Deletion -----------------------------------------------------------------

export const PROFILE_ITEM_KINDS = [
  "link",
  "experience",
  "skill",
  "education",
  "certification",
  "project",
] as const;
export type ProfileItemKind = (typeof PROFILE_ITEM_KINDS)[number];

export const deleteProfileItemSchema = z.object({
  kind: z.enum(PROFILE_ITEM_KINDS),
  id: z.uuid(),
});
