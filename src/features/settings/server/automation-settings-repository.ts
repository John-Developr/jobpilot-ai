import "server-only";
import type { AuthenticatedContext } from "@/server/auth";
import { RepositoryError } from "@/server/errors";
import type { Tables } from "@/types/database";
import type { SubmissionScheduleSettings } from "@/lib/scheduling/submission-window";
import type { AutomationScheduleInput } from "../schemas";
import { parseWeights, type Weights } from "@/features/evaluation/scoring";

export interface AutomationSettings extends SubmissionScheduleSettings {
  pausedAt: string | null;
  pausedReason: string | null;
  dailyApplicationLimit: number;
  minMatchScore: number;
  requireApproval: boolean;
  maxRetries: number;
  retryBackoffMinutes: number;
  scoringWeights: Weights;
  updatedAt: string;
}

/** Postgres `time` comes back as HH:MM:SS; the app works in HH:MM. */
const toHourMinute = (value: string): string => value.slice(0, 5);

function toDomain(row: Tables<"automation_settings">): AutomationSettings {
  return {
    isEnabled: row.is_enabled,
    isPaused: row.is_paused,
    pausedAt: row.paused_at,
    pausedReason: row.paused_reason,
    timezone: row.timezone,
    workingDays: row.working_days,
    windowStart: toHourMinute(row.window_start),
    windowEnd: toHourMinute(row.window_end),
    dailyApplicationLimit: row.daily_application_limit,
    minMatchScore: row.min_match_score,
    requireApproval: row.require_approval,
    maxRetries: row.max_retries,
    retryBackoffMinutes: row.retry_backoff_minutes,
    scoringWeights: parseWeights(row.scoring_weights),
    updatedAt: row.updated_at,
  };
}

export async function getAutomationSettings({ supabase, userId }: AuthenticatedContext): Promise<AutomationSettings> {
  const { data, error } = await supabase
    .from("automation_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new RepositoryError("Failed to load automation settings", { cause: error });
  // The row is created by the new-user trigger; a missing row means the migration was not applied.
  if (!data) throw new RepositoryError("Automation settings row is missing for this user");
  return toDomain(data);
}

export async function updateAutomationSchedule(
  { supabase, userId }: AuthenticatedContext,
  input: AutomationScheduleInput,
): Promise<AutomationSettings> {
  const { data, error } = await supabase
    .from("automation_settings")
    .update({
      is_enabled: input.isEnabled,
      timezone: input.timezone,
      working_days: [...input.workingDays].sort((a, b) => a - b),
      window_start: input.windowStart,
      window_end: input.windowEnd,
      daily_application_limit: input.dailyApplicationLimit,
      min_match_score: input.minMatchScore,
      max_retries: input.maxRetries,
      retry_backoff_minutes: input.retryBackoffMinutes,
    })
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new RepositoryError("Failed to update automation settings", { cause: error });
  return toDomain(data);
}

export async function setEmergencyPause(
  { supabase, userId }: AuthenticatedContext,
  pause: { paused: true; reason?: string } | { paused: false },
): Promise<AutomationSettings> {
  const values = pause.paused
    ? { is_paused: true, paused_at: new Date().toISOString(), paused_reason: pause.reason || null }
    : { is_paused: false, paused_at: null, paused_reason: null };
  const { data, error } = await supabase
    .from("automation_settings")
    .update(values)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new RepositoryError("Failed to change emergency pause", { cause: error });
  return toDomain(data);
}

export async function updateScoringWeights({ supabase, userId }: AuthenticatedContext, weights: Weights): Promise<void> {
  const { error } = await supabase.from("automation_settings").update({ scoring_weights: weights }).eq("user_id", userId);
  if (error) throw new RepositoryError("Failed to update scoring weights", { cause: error });
}
