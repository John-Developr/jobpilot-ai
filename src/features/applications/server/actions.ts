"use server";

import type { ActionResult } from "@/server/action-result";
import { runAction } from "@/server/run-action";
import { evaluateSubmissionWindow } from "@/lib/scheduling/submission-window";
import { getAutomationSettings } from "@/features/settings/server/automation-settings-repository";
import { submitAfter } from "../queue";
import { applicationIdSchema } from "../schemas";
import {
  approveApplication,
  markApplicationSubmitted,
  withdrawApproval,
  type ApplicationStatus,
} from "./application-repository";

/**
 * Approves the application for submission. Approved inside the submission window it is due
 * now; outside it, it is scheduled for the next window start (server time decides).
 */
export async function approveApplicationAction(input: unknown): Promise<ActionResult<ApplicationStatus>> {
  return runAction({
    schema: applicationIdSchema,
    input,
    event: "applications.approve",
    failMessage: "Could not approve the application. Try again.",
    run: async (ctx, { applicationId }) => {
      const settings = await getAutomationSettings(ctx);
      return approveApplication(ctx, applicationId, submitAfter(evaluateSubmissionWindow(new Date(), settings)));
    },
  });
}

export async function withdrawApprovalAction(input: unknown): Promise<ActionResult<ApplicationStatus>> {
  return runAction({
    schema: applicationIdSchema,
    input,
    event: "applications.withdraw_approval",
    failMessage: "Could not withdraw the approval. Try again.",
    run: (ctx, { applicationId }) => withdrawApproval(ctx, applicationId),
  });
}

export async function markAppliedAction(input: unknown): Promise<ActionResult<ApplicationStatus>> {
  return runAction({
    schema: applicationIdSchema,
    input,
    event: "applications.mark_applied",
    failMessage: "Could not mark the application as applied. Try again.",
    run: (ctx, { applicationId }) => markApplicationSubmitted(ctx, applicationId),
  });
}
