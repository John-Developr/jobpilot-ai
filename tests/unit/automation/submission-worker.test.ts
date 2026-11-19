import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubmissionAdapter, SubmissionInput, SubmissionOutcome } from "@/features/automation/adapters";
import type { AuthenticatedContext } from "@/server/auth";

vi.mock("server-only", () => ({}));

const repo = vi.hoisted(() => ({
  claimNext: vi.fn(),
  completeSubmission: vi.fn(),
  failAttempt: vi.fn(),
  getApplicationJobUrl: vi.fn(),
  listDueCandidates: vi.fn(),
  releaseClaim: vi.fn(),
}));
vi.mock("@/features/automation/server/worker-repository", () => repo);

const settings = vi.hoisted(() => ({
  current: {
    isEnabled: true,
    isPaused: false,
    timezone: "Asia/Manila",
    workingDays: [1, 2, 3, 4, 5],
    windowStart: "09:00",
    windowEnd: "17:00",
  },
}));
vi.mock("@/features/settings/server/automation-settings-repository", () => ({
  getAutomationSettings: vi.fn(async () => settings.current),
}));

const { claimNextSubmission, runClaimedSubmission } = await import("@/features/automation/server/submission-worker");

/** Manila is UTC+8. 2026-11-16 is a Monday. */
const manila = (isoLocal: string) => new Date(`${isoLocal}+08:00`);
const OPEN = manila("2026-11-16T10:00:00");
const CLOSED = manila("2026-11-16T18:00:00");

const ctx = { userId: "user-1", email: null, supabase: {} } as unknown as AuthenticatedContext;
const claim = { applicationId: "app-1", lockToken: "lock-1", runId: "run-1", attempt: 1 };

function adapter(run: (input: SubmissionInput) => Promise<SubmissionOutcome>): SubmissionAdapter {
  return { id: "test", dryRun: false, matches: (url) => url.hostname === "jobs.example.com", run };
}

beforeEach(() => {
  vi.clearAllMocks();
  settings.current = { ...settings.current, isEnabled: true, isPaused: false };
  repo.getApplicationJobUrl.mockResolvedValue("https://jobs.example.com/apply/1");
});

describe("claimNextSubmission", () => {
  it("offers only due applications whose site has an adapter, inside the window", async () => {
    repo.listDueCandidates.mockResolvedValue([
      { applicationId: "supported", jobUrl: "https://jobs.example.com/1" },
      { applicationId: "unsupported", jobUrl: "https://other.example.com/2" },
    ]);
    await claimNextSubmission(ctx, OPEN, [adapter(async () => ({ kind: "not_confirmed" }))]);
    expect(repo.claimNext).toHaveBeenCalledWith(ctx, expect.objectContaining({ start: expect.any(Date) }), ["supported"]);
  });

  it("outside the window claims nothing but still lets the claim clear stale runs", async () => {
    await claimNextSubmission(ctx, CLOSED, [adapter(async () => ({ kind: "not_confirmed" }))]);
    expect(repo.listDueCandidates).not.toHaveBeenCalled();
    expect(repo.claimNext).toHaveBeenCalledWith(ctx, expect.anything(), []);
  });
});

describe("runClaimedSubmission", () => {
  it("releases without running when the window closed before the run started", async () => {
    const run = vi.fn();
    const result = await runClaimedSubmission(ctx, claim, { adapters: [adapter(run)], now: () => CLOSED });
    expect(result).toBe("released");
    expect(run).not.toHaveBeenCalled();
    expect(repo.releaseClaim).toHaveBeenCalledWith(ctx, claim, manila("2026-11-17T09:00:00"), expect.any(String));
  });

  it("re-reads settings right before the final click and stops when paused meanwhile", async () => {
    const result = await runClaimedSubmission(ctx, claim, {
      now: () => OPEN,
      adapters: [
        adapter(async ({ confirmFinalSubmit }) => {
          settings.current = { ...settings.current, isPaused: true };
          return (await confirmFinalSubmit()) ? { kind: "submitted", evidence: { url: "x" } } : { kind: "not_confirmed" };
        }),
      ],
    });
    expect(result).toBe("released");
    expect(repo.completeSubmission).not.toHaveBeenCalled();
    expect(repo.releaseClaim).toHaveBeenCalledWith(ctx, claim, null, expect.stringContaining("before the final click"));
  });

  it("records a verified submission", async () => {
    const result = await runClaimedSubmission(ctx, claim, {
      now: () => OPEN,
      adapters: [
        adapter(async ({ confirmFinalSubmit, markFinalClick }) => {
          if (!(await confirmFinalSubmit())) return { kind: "not_confirmed" };
          markFinalClick();
          return { kind: "submitted", evidence: { confirmation_text: "Thanks for applying" } };
        }),
      ],
    });
    expect(result).toBe("applied");
    expect(repo.completeSubmission).toHaveBeenCalledWith(ctx, claim, { confirmation_text: "Thanks for applying" });
  });

  it("turns a dry run into a non-retryable stop for review", async () => {
    await runClaimedSubmission(ctx, claim, {
      now: () => OPEN,
      adapters: [adapter(async () => ({ kind: "dry_run_complete", screenshotPaths: [] }))],
    });
    expect(repo.failAttempt).toHaveBeenCalledWith(ctx, claim, expect.objectContaining({ code: "dry_run", retryable: false }));
  });

  it("fails sites without an adapter without retrying", async () => {
    repo.getApplicationJobUrl.mockResolvedValue("https://other.example.com/1");
    const result = await runClaimedSubmission(ctx, claim, { now: () => OPEN, adapters: [adapter(vi.fn())] });
    expect(result).toBe("unsupported_site");
    expect(repo.failAttempt).toHaveBeenCalledWith(ctx, claim, expect.objectContaining({ retryable: false }));
  });

  it("retries errors before the final click, never after it", async () => {
    await runClaimedSubmission(ctx, claim, {
      now: () => OPEN,
      adapters: [
        adapter(async () => {
          throw new Error("network");
        }),
      ],
    });
    expect(repo.failAttempt).toHaveBeenLastCalledWith(ctx, claim, expect.objectContaining({ code: "worker_error", retryable: true }));

    await runClaimedSubmission(ctx, claim, {
      now: () => OPEN,
      adapters: [
        adapter(async ({ markFinalClick }) => {
          markFinalClick();
          throw new Error("page crashed");
        }),
      ],
    });
    expect(repo.failAttempt).toHaveBeenLastCalledWith(
      ctx,
      claim,
      expect.objectContaining({ code: "error_after_submit", retryable: false }),
    );
  });

  it("never retries when a submission could not be recorded", async () => {
    repo.completeSubmission.mockRejectedValueOnce(new Error("claim not found"));
    const result = await runClaimedSubmission(ctx, claim, {
      now: () => OPEN,
      adapters: [adapter(async () => ({ kind: "submitted", evidence: { url: "https://jobs.example.com/thanks" } }))],
    });
    expect(result).toBe("error");
    expect(repo.failAttempt).toHaveBeenCalledWith(ctx, claim, expect.objectContaining({ retryable: false }));
  });
});
