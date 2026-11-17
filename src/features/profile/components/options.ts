import {
  EMPLOYMENT_TYPE_LABELS,
  PROFICIENCY_LABELS,
  REMOTE_TYPE_LABELS,
  SALARY_PERIOD_LABELS,
  SKILL_CATEGORY_LABELS,
} from "@/config/labels";
import type { SelectOption } from "@/components/shared/form-fields";

const toOptions = (labels: Record<string, string>): SelectOption[] =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

export const EMPLOYMENT_TYPE_OPTIONS = toOptions(EMPLOYMENT_TYPE_LABELS);
export const REMOTE_TYPE_OPTIONS = toOptions(REMOTE_TYPE_LABELS).filter((o) => o.value !== "unknown");
export const SKILL_CATEGORY_OPTIONS = toOptions(SKILL_CATEGORY_LABELS);
export const SALARY_PERIOD_OPTIONS = toOptions(SALARY_PERIOD_LABELS);
export const PROFICIENCY_OPTIONS = toOptions(PROFICIENCY_LABELS).map((o) => ({
  ...o,
  label: `${o.value} — ${o.label}`,
}));
