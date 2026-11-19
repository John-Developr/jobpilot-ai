import "server-only";
import type { AuthenticatedContext } from "@/server/auth";
import { UserFacingError } from "@/server/errors";
import { logger } from "@/lib/monitoring/logger";
import { AUTOMATED_CONNECTOR_KEYS, type AutomatedConnectorKey } from "@/lib/integrations/job-sources/catalog";
import { syncSource } from "@/features/jobs/server/ingestion-service";
import { finishRun, listEnabledSources, startDiscoveryRun } from "./worker-repository";

const isAutomatedKey = (key: string): key is AutomatedConnectorKey =>
  (AUTOMATED_CONNECTOR_KEYS as readonly string[]).includes(key);

export interface DiscoveryResult {
  sourceKey: string;
  outcome: "synced" | "skipped" | "failed";
  inserted: number;
}

/**
 * Scheduled discovery for one user: syncs every enabled automated source with the same steps
 * as "Sync now". Each source gets one automation run per schedule tick (idempotency key), and a
 * failing source never stops the others.
 */
export async function runScheduledDiscovery(
  ctx: AuthenticatedContext,
  { now, scheduleKey, externalRunId }: { now: Date; scheduleKey: string; externalRunId: string | null },
): Promise<DiscoveryResult[]> {
  const results: DiscoveryResult[] = [];
  for (const source of await listEnabledSources(ctx)) {
    if (!isAutomatedKey(source.connectorKey)) continue;
    const runId = await startDiscoveryRun(ctx, {
      sourceId: source.id,
      idempotencyKey: `discover:${source.id}:${scheduleKey}`,
      externalRunId,
    });
    if (!runId) {
      results.push({ sourceKey: source.connectorKey, outcome: "skipped", inserted: 0 });
      continue;
    }
    try {
      const summary = await syncSource(ctx, source.connectorKey, now);
      const message = `Found ${summary.fetched}, matched ${summary.matched}, added ${summary.inserted}.${
        summary.warnings.length ? ` ${summary.warnings.join(" ")}` : ""
      }`;
      await finishRun(ctx, runId, { status: "succeeded", message });
      results.push({ sourceKey: source.connectorKey, outcome: "synced", inserted: summary.inserted });
    } catch (error) {
      // UserFacingError covers cooldowns and connector errors; anything else is unexpected.
      const message = error instanceof UserFacingError ? error.message : "The sync failed unexpectedly.";
      if (!(error instanceof UserFacingError)) {
        logger.error("automation.discovery.failed", { userId: ctx.userId, source: source.connectorKey, error });
      }
      await finishRun(ctx, runId, {
        status: "failed",
        message,
        errorCode: error instanceof UserFacingError ? "sync_refused" : "sync_error",
      });
      results.push({ sourceKey: source.connectorKey, outcome: "failed", inserted: 0 });
    }
  }
  return results;
}
