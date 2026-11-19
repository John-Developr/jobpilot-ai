import { logger, schedules } from "@trigger.dev/sdk";
import { createServiceClient, workerContext } from "@/lib/supabase/service";
import { claimNextSubmission } from "@/features/automation/server/submission-worker";
import { listAutomationUsers, releaseClaim } from "@/features/automation/server/worker-repository";
import { submitApplication } from "./submit-application";

/**
 * Every 10 minutes: for each user with automation on, claim at most one due application and
 * start its submission run. The window, pause and daily limit are checked here, again when the
 * run starts, and once more right before the final click.
 */
export const scheduleSubmissions = schedules.task({
  id: "schedule-submissions",
  cron: "*/10 * * * *",
  maxDuration: 120,
  run: async () => {
    const supabase = createServiceClient();
    for (const userId of await listAutomationUsers(supabase)) {
      const ctx = workerContext(supabase, userId);
      const claim = await claimNextSubmission(ctx, new Date());
      if (!claim) continue;
      try {
        await submitApplication.trigger({ userId, ...claim }, { idempotencyKey: `submit:${claim.runId}` });
      } catch (error) {
        logger.error("Could not start the submission run", { userId, applicationId: claim.applicationId, error });
        await releaseClaim(ctx, claim, null, "The submission run could not be started.");
      }
    }
  },
});
