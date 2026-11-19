import type { AuthenticatedContext } from "@/server/auth";

/**
 * Site adapters fill one job site's application form from verified data (Playwright, Phase 7).
 * An adapter is added only after the site's terms are checked; CAPTCHA, login prompts,
 * unknown or sensitive questions and unexpected pages stop the run (`stopped`), never bypassed.
 */
export interface SubmissionInput {
  /** Worker context for the application's owner; read data through the existing repositories. */
  ctx: AuthenticatedContext;
  applicationId: string;
  jobUrl: string;
  /**
   * Re-reads the pause flag and settings and re-checks the submission window with server time.
   * Call immediately before the final click; when it returns false, return `not_confirmed`.
   */
  confirmFinalSubmit: () => Promise<boolean>;
  /** Call right before sending the final click. From then on a failure is never retried. */
  markFinalClick: () => void;
}

export type SubmissionOutcome =
  /** Confirmation verified (page text, URL or email). Evidence goes to the run log. */
  | { kind: "submitted"; evidence: Record<string, string> }
  /** Form filled and captured, final click deliberately not sent. */
  | { kind: "dry_run_complete"; screenshotPaths: string[] }
  /** `confirmFinalSubmit` returned false: the window closed or automation was paused. */
  | { kind: "not_confirmed" }
  /** Needs the user (CAPTCHA, login, unknown field, layout change). Never retried. */
  | { kind: "stopped"; code: string; message: string };

export interface SubmissionAdapter {
  id: string;
  /** Fixed per adapter in code, never taken from a task payload. Dry-run adapters never click submit. */
  dryRun: boolean;
  matches: (url: URL) => boolean;
  run: (input: SubmissionInput) => Promise<SubmissionOutcome>;
}

/** Registered adapters. Empty until the first site is approved, so nothing is claimed yet. */
export const SUBMISSION_ADAPTERS: readonly SubmissionAdapter[] = [];

export function findAdapter(
  jobUrl: string,
  adapters: readonly SubmissionAdapter[] = SUBMISSION_ADAPTERS,
): SubmissionAdapter | null {
  let url: URL;
  try {
    url = new URL(jobUrl);
  } catch {
    return null;
  }
  return adapters.find((adapter) => adapter.matches(url)) ?? null;
}
