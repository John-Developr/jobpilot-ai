import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { createServiceClient, workerContext } from "@/lib/supabase/service";
import { runClaimedSubmission } from "@/features/automation/server/submission-worker";
import { setExternalRunId } from "@/features/automation/server/worker-repository";

/**
 * Runs one claimed application. One at a time; finishes well before the 60-minute stale-claim
 * limit, so a live run is never cleared while it may still click submit.
 */
export const submitApplication = schemaTask({
  id: "submit-application",
  schema: z.object({
    userId: z.uuid(),
    applicationId: z.uuid(),
    lockToken: z.uuid(),
    runId: z.uuid(),
    attempt: z.number().int().positive(),
  }),
  queue: { concurrencyLimit: 1 },
  maxDuration: 900,
  retry: { maxAttempts: 1 },
  run: async ({ userId, ...claim }, { ctx }) => {
    const worker = workerContext(createServiceClient(), userId);
    await setExternalRunId(worker, claim.runId, ctx.run.id);
    return { result: await runClaimedSubmission(worker, claim) };
  },
});
