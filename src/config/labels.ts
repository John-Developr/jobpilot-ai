import type { DbEnum } from "@/types/database";

/** Display labels for database enums. `satisfies` keeps them in sync with the DB types. */

export const EMPLOYMENT_TYPE_LABELS = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  freelance: "Freelance",
  internship: "Internship",
  temporary: "Temporary",
  other: "Other",
} as const satisfies Record<DbEnum<"employment_type">, string>;

export const REMOTE_TYPE_LABELS = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unknown: "Unspecified",
} as const satisfies Record<DbEnum<"remote_type">, string>;

export const SKILL_CATEGORY_LABELS = {
  language: "Languages",
  framework: "Frameworks & libraries",
  platform: "Platforms",
  database: "Databases",
  cloud: "Cloud & backend services",
  tool: "Tools",
  practice: "Practices",
  other: "Other",
} as const satisfies Record<DbEnum<"skill_category">, string>;

export const SALARY_PERIOD_LABELS = {
  hour: "per hour",
  day: "per day",
  month: "per month",
  year: "per year",
} as const satisfies Record<DbEnum<"salary_period">, string>;

export const PROFICIENCY_LABELS: Record<number, string> = {
  1: "Beginner",
  2: "Working knowledge",
  3: "Proficient",
  4: "Advanced",
  5: "Expert",
};

export const EMPLOYMENT_TYPES = Object.keys(EMPLOYMENT_TYPE_LABELS) as [
  DbEnum<"employment_type">,
  ...DbEnum<"employment_type">[],
];
export const REMOTE_TYPES = Object.keys(REMOTE_TYPE_LABELS) as [
  DbEnum<"remote_type">,
  ...DbEnum<"remote_type">[],
];
export const SKILL_CATEGORIES = Object.keys(SKILL_CATEGORY_LABELS) as [
  DbEnum<"skill_category">,
  ...DbEnum<"skill_category">[],
];
export const SALARY_PERIODS = Object.keys(SALARY_PERIOD_LABELS) as [
  DbEnum<"salary_period">,
  ...DbEnum<"salary_period">[],
];
