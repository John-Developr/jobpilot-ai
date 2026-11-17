"use server";

import { z } from "zod";
import type { ActionResult } from "@/server/action-result";
import { runAction } from "@/server/run-action";
import { evaluateJobSchema } from "../schemas";
import { evaluateJob, type EvaluationSummary } from "./evaluation-service";
import { listUnevaluatedJobIds } from "./evaluation-repository";

const BATCH_LIMIT = 25;
const FAIL = "Evaluation failed. Try again.";

export async function evaluateJobAction(input: unknown): Promise<ActionResult<EvaluationSummary>> {
  return runAction({
    schema: evaluateJobSchema,
    input,
    event: "evaluation.job.evaluate",
    failMessage: FAIL,
    run: (ctx, { jobId, force }) => evaluateJob(ctx, jobId, force),
  });
}

/** Batch step: same as evaluateJobAction but without re-rendering the page after every job. */
export async function evaluateJobInBatchAction(input: unknown): Promise<ActionResult<EvaluationSummary>> {
  return runAction({
    schema: evaluateJobSchema,
    input,
    event: "evaluation.job.evaluate",
    failMessage: FAIL,
    run: (ctx, { jobId, force }) => evaluateJob(ctx, jobId, force),
    refreshRoute: false,
  });
}

export async function listUnevaluatedJobsAction(): Promise<ActionResult<{ ids: string[]; total: number }>> {
  return runAction({
    schema: z.undefined(),
    input: undefined,
    event: "evaluation.job.list_unevaluated",
    failMessage: "Could not load jobs to score.",
    run: (ctx) => listUnevaluatedJobIds(ctx, BATCH_LIMIT),
    refreshRoute: false,
  });
}
