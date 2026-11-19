import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedContext } from "@/server/auth";
import { UserFacingError } from "@/server/errors";

vi.mock("server-only", () => ({}));

const repo = vi.hoisted(() => ({
  finishRun: vi.fn(),
  listEnabledSources: vi.fn(),
  startDiscoveryRun: vi.fn(),
}));
vi.mock("@/features/automation/server/worker-repository", () => repo);

const syncSource = vi.hoisted(() => vi.fn());
vi.mock("@/features/jobs/server/ingestion-service", () => ({ syncSource }));

const { runScheduledDiscovery } = await import("@/features/automation/server/discovery-worker");

const ctx = { userId: "user-1", email: null, supabase: {} } as unknown as AuthenticatedContext;
const options = { now: new Date("2026-11-16T00:00:00Z"), scheduleKey: "2026-11-16T00:00:00.000Z", externalRunId: "run_x" };

beforeEach(() => {
  vi.clearAllMocks();
  repo.listEnabledSources.mockResolvedValue([
    { id: "s1", connectorKey: "remoteok" },
    { id: "s2", connectorKey: "greenhouse" },
  ]);
  repo.startDiscoveryRun.mockImplementation(async (_ctx: unknown, input: { sourceId: string }) => `run-${input.sourceId}`);
});

describe("runScheduledDiscovery", () => {
  it("syncs each source with one run per schedule tick", async () => {
    syncSource.mockResolvedValue({ fetched: 10, matched: 4, inserted: 2, skipped: 2, warnings: [] });
    const results = await runScheduledDiscovery(ctx, options);
    expect(results.map((r) => r.outcome)).toEqual(["synced", "synced"]);
    expect(repo.startDiscoveryRun).toHaveBeenCalledWith(ctx, {
      sourceId: "s1",
      idempotencyKey: "discover:s1:2026-11-16T00:00:00.000Z",
      externalRunId: "run_x",
    });
    expect(repo.finishRun).toHaveBeenCalledWith(ctx, "run-s1", { status: "succeeded", message: "Found 10, matched 4, added 2." });
  });

  it("keeps going when one source fails", async () => {
    syncSource
      .mockRejectedValueOnce(new UserFacingError("Remote OK was synced 2 min ago."))
      .mockResolvedValueOnce({ fetched: 1, matched: 1, inserted: 1, skipped: 0, warnings: [] });
    const results = await runScheduledDiscovery(ctx, options);
    expect(results.map((r) => r.outcome)).toEqual(["failed", "synced"]);
    expect(repo.finishRun).toHaveBeenCalledWith(ctx, "run-s1", expect.objectContaining({ status: "failed", errorCode: "sync_refused" }));
  });

  it("skips sources already run for this schedule tick", async () => {
    repo.startDiscoveryRun.mockResolvedValue(null);
    const results = await runScheduledDiscovery(ctx, options);
    expect(results.every((r) => r.outcome === "skipped")).toBe(true);
    expect(syncSource).not.toHaveBeenCalled();
  });
});
