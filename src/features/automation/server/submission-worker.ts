import "server-only";
import type { AuthenticatedContext } from "@/server/auth";
import { logger } from "@/lib/monitoring/logger";
import { evaluateSubmissionWindow, localDayBounds, type SubmissionWindowStatus } from "@/lib/scheduling/submission-window";
import { getAutomationSettings } from "@/features/settings/server/automation-settings-repository";
import { submitAfter } from "@/features/applications/queue";
import { findAdapter, SUBMISSION_ADAPTERS, type SubmissionAdapter } from "../adapters";
import {
  claimNext,
  completeSubmission,
  failAttempt,
  getApplicationJobUrl,
  listDueCandidates,
  releaseClaim,
  type Claim,
} from "./worker-repository";

/** Reads the settings fresh from the database and evaluates the window with server time. */
async function currentWindow(ctx: AuthenticatedContext, now: Date): Promise<SubmissionWindowStatus> {
  return evaluateSubmissionWindow(now, await getAutomationSettings(ctx));
}

/**
 * One scheduler tick for one user. Inside the window, claims at most one due application
 * whose job site has an adapter (the claim itself re-checks pause, enabled and the daily
 * limit). Outside it, still calls the claim with no candidates so stale runs are cleared.
 */
export async function claimNextSubmission(
  ctx: AuthenticatedContext,
  now: Date,
  adapters: readonly SubmissionAdapter[] = SUBMISSION_ADAPTERS,
): Promise<Claim | null> {
  const settings = await getAutomationSettings(ctx);
  const window = evaluateSubmissionWindow(now, settings);
  const candidates = window.open
    ? (await listDueCandidates(ctx, now)).filter((candidate) => findAdapter(candidate.jobUrl, adapters))
    : [];
  return claimNext(
    ctx,
    localDayBounds(now, settings.timezone),
    candidates.map((candidate) => candidate.applicationId),
  );
}

export type SubmissionResult =
  | "applied"
  | "released"
  | "dry_run"
  | "stopped"
  | "unsupported_site"
  | "error";

interface RunOptions {
  adapters?: readonly SubmissionAdapter[];
  now?: () => Date;
}

/**
 * Runs one claimed application to a recorded outcome: complete, release or fail. Never leaves
 * the claim open. A failure is retryable only if it happened before the final click.
 */
export async function runClaimedSubmission(
  ctx: AuthenticatedContext,
  claim: Claim,
  { adapters = SUBMISSION_ADAPTERS, now = () => new Date() }: RunOptions = {},
): Promise<SubmissionResult> {
  const log = { userId: ctx.userId, applicationId: claim.applicationId, runId: claim.runId };
  let finalClickReached = false;

  try {
    const atStart = await currentWindow(ctx, now());
    if (!atStart.open) {
      await releaseClaim(ctx, claim, submitAfter(atStart), `Not submitted: ${atStart.reason.replaceAll("_", " ")}.`);
      return "released";
    }

    const jobUrl = await getApplicationJobUrl(ctx, claim.applicationId);
    const adapter = jobUrl ? findAdapter(jobUrl, adapters) : null;
    if (!jobUrl || !adapter) {
      await failAttempt(ctx, claim, {
        code: "unsupported_site",
        message: "JobPilot cannot fill this job site's form. Submit it yourself.",
        retryable: false,
      });
      return "unsupported_site";
    }

    let lastCheck: SubmissionWindowStatus = atStart;
    const outcome = await adapter.run({
      ctx,
      applicationId: claim.applicationId,
      jobUrl,
      confirmFinalSubmit: async () => {
        lastCheck = await currentWindow(ctx, now());
        return lastCheck.open;
      },
      markFinalClick: () => {
        finalClickReached = true;
      },
    });

    switch (outcome.kind) {
      case "submitted":
        finalClickReached = true; // even if the adapter forgot to mark it: never retry a submission
        try {
          await completeSubmission(ctx, claim, outcome.evidence);
        } catch (error) {
          // Submitted on the site but not recorded (e.g. the claim expired): the user must know.
          logger.error("automation.submission.unrecorded", { ...log, evidence: outcome.evidence, error });
          throw error;
        }
        logger.info("automation.submission.applied", log);
        return "applied";
      case "dry_run_complete":
        await failAttempt(ctx, claim, {
          code: "dry_run",
          message: "Dry run: the form was filled but not submitted. Check the screenshots, then submit it yourself.",
          retryable: false,
        });
        return "dry_run";
      case "not_confirmed":
        await releaseClaim(
          ctx,
          claim,
          lastCheck.open ? null : submitAfter(lastCheck),
          "Stopped before the final click: the window closed or automation was paused.",
        );
        return "released";
      case "stopped":
        await failAttempt(ctx, claim, { code: outcome.code, message: outcome.message, retryable: false });
        return "stopped";
    }
  } catch (error) {
    logger.error("automation.submission.failed", { ...log, finalClickReached, error });
    try {
      await failAttempt(ctx, claim, {
        code: finalClickReached ? "error_after_submit" : "worker_error",
        message: finalClickReached
          ? "The run failed after the final click. Check the job site to see whether it was submitted."
          : "The run failed before submitting.",
        retryable: !finalClickReached,
      });
    } catch (recordError) {
      // The claim is gone (completed or cleared as stale); nothing else to release.
      logger.error("automation.submission.record_failed", { ...log, error: recordError });
    }
    return "error";
  }
}
