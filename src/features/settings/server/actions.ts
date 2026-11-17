"use server";

import type { ActionResult } from "@/server/action-result";
import { runAction } from "@/server/run-action";
import { automationScheduleSchema, emergencyPauseSchema } from "../schemas";
import { setEmergencyPause, updateAutomationSchedule, updateScoringWeights } from "./automation-settings-repository";
import { weightsSchema } from "@/features/evaluation/scoring";

export async function updateAutomationScheduleAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: automationScheduleSchema,
    input,
    event: "settings.automation_schedule.update",
    failMessage: "Settings could not be saved. Try again.",
    run: async (ctx, data) => {
      await updateAutomationSchedule(ctx, data);
      return null;
    },
  });
}

export async function setEmergencyPauseAction(input: unknown): Promise<ActionResult<{ paused: boolean }>> {
  return runAction({
    schema: emergencyPauseSchema,
    input,
    event: "automation.emergency_pause.change",
    failMessage: "Emergency pause could not be changed. Try again.",
    run: async (ctx, data) => {
      const settings = await setEmergencyPause(ctx, data);
      return { paused: settings.isPaused };
    },
  });
}

export async function updateScoringWeightsAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: weightsSchema,
    input,
    event: "settings.scoring_weights.update",
    failMessage: "Weights could not be saved. Try again.",
    run: async (ctx, data) => {
      await updateScoringWeights(ctx, data);
      return null;
    },
  });
}
