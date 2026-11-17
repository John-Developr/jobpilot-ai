"use server";

import type { ActionResult } from "@/server/action-result";
import { UserFacingError } from "@/server/errors";
import { runAction } from "@/server/run-action";
import { JOB_SOURCE_CATALOG } from "@/lib/integrations/job-sources/catalog";
import { companyBoardConfigSchema, keywordFeedConfigSchema } from "@/lib/integrations/job-sources/types";
import {
  archiveJobSchema,
  jobIdSchema,
  manualJobSchema,
  prefillSchema,
  saveSourceSchema,
  sourceKeySchema,
} from "../schemas";
import { deleteJob, setJobArchived } from "./job-repository";
import { addManualJob, prefillFromUrl, syncSource, type SyncSummary } from "./ingestion-service";
import { upsertSource } from "./source-repository";

export async function addManualJobAction(input: unknown): Promise<ActionResult<{ jobId: string }>> {
  return runAction({
    schema: manualJobSchema,
    input,
    event: "jobs.manual.create",
    failMessage: "Could not add the job. Try again.",
    run: async (ctx, data) => ({ jobId: await addManualJob(ctx, data) }),
  });
}

export async function prefillJobAction(input: unknown) {
  return runAction({
    schema: prefillSchema,
    input,
    event: "jobs.manual.prefill",
    failMessage: "Could not read that page. Fill in the details manually.",
    run: (_ctx, { url }) => prefillFromUrl(url),
    refreshRoute: false,
  });
}

export async function setJobArchivedAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: archiveJobSchema,
    input,
    event: "jobs.job.archive",
    failMessage: "Could not update the job. Try again.",
    run: (ctx, { jobId, archived }) => setJobArchived(ctx, jobId, archived).then(() => null),
  });
}

export async function deleteJobAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: jobIdSchema,
    input,
    event: "jobs.job.delete",
    failMessage: "Could not delete the job. Try again.",
    run: (ctx, { jobId }) => deleteJob(ctx, jobId).then(() => null),
  });
}

export async function saveSourceAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: saveSourceSchema,
    input,
    event: "jobs.source.save",
    failMessage: "Could not save the source. Try again.",
    run: async (ctx, { key, isEnabled, config }) => {
      const schema =
        JOB_SOURCE_CATALOG[key].configKind === "companies" ? companyBoardConfigSchema : keywordFeedConfigSchema;
      const parsed = schema.safeParse(config);
      if (!parsed.success) {
        throw new UserFacingError(parsed.error.issues[0]?.message ?? "Check the source settings.");
      }
      await upsertSource(ctx, key, { isEnabled, config: parsed.data });
      return null;
    },
  });
}

export async function syncSourceAction(input: unknown): Promise<ActionResult<SyncSummary>> {
  return runAction({
    schema: sourceKeySchema,
    input,
    event: "jobs.source.sync",
    failMessage: "The sync failed. Try again later.",
    run: (ctx, { key }) => syncSource(ctx, key, new Date()),
  });
}
