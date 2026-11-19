import { logger, schedules } from "@trigger.dev/sdk";
import { createServiceClient, workerContext } from "@/lib/supabase/service";
import { runScheduledDiscovery } from "@/features/automation/server/discovery-worker";
import { listDiscoveryUsers } from "@/features/automation/server/worker-repository";

/** Every 6 hours: sync each user's enabled job sources (same steps as "Sync now"). */
export const discoverJobs = schedules.task({
  id: "discover-jobs",
  cron: "0 */6 * * *",
  maxDuration: 900,
  run: async (payload, { ctx }) => {
    const supabase = createServiceClient();
    const scheduleKey = payload.timestamp.toISOString();
    for (const userId of await listDiscoveryUsers(supabase)) {
      const results = await runScheduledDiscovery(workerContext(supabase, userId), {
        now: new Date(),
        scheduleKey,
        externalRunId: ctx.run.id,
      });
      logger.info("Discovery finished", { userId, results });
    }
  },
});
