# ADR-003: Automation engine and submission safety

- **Status:** Accepted (2026-11-17) — implementation Phase 6–7

## Context

Automated submissions are the riskiest feature: duplicates, submissions outside working hours, platform ToS
violations and false "applied" states all hurt the user. Browser automation is long-running and fragile.

## Decision

1. **One schedule rule module** (`src/lib/scheduling/submission-window.ts`), pure and unit-tested; window is
   `[start, end)` on configured working days in the configured timezone, evaluated with server time.
2. **Check at the last moment:** the submission task re-evaluates the window and re-reads the pause flag
   immediately before the final submit action, not only when the task starts.
3. **Human approval required** for every application in the current release (`require_approval` is shown but locked).
4. **Atomic claim** in Postgres (lock token + idempotency key + status guard) before any browser action;
   daily limit counted in the same transaction under a per-user advisory lock.
5. **Playwright in Trigger.dev workers**, one isolated browser context per run, no shared cookies between runs.
6. **Supported flows only:** an adapter exists per platform after its terms are checked. Unknown pages,
   CAPTCHA, login prompts, unknown or sensitive questions, or layout changes stop the run with
   `needs_attention` and screenshots. No CAPTCHA solving, no stealth/evasion plugins.
7. **Verification required** before `applied` (confirmation page/URL/email evidence stored in the run log);
   enforced by a DB check constraint for `submission_method = 'automation'`.

## Alternatives

- Browser extension running in the user's own browser: better for sites that block headless browsers, but
  harder to schedule and audit. Revisit if supported flows prove too few.
- Fully autonomous submission without approval: rejected for the initial release.

## Consequences

- Some platforms will never be automated; the product must be valuable with manual submission + tracking.
- Submissions may slip to the next window if a task runs long; this is intended.
