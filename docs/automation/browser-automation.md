# Browser automation

Status: **Planned (Phase 7).** Playwright is installed as a dev dependency for e2e tests only.

## Runtime

- Runs inside Trigger.dev workers (Playwright build extension), never on Vercel.
- One fresh, isolated browser context per run; no persistent profile directory.
- Logged-in sessions (only where a platform allows automation) are stored as encrypted storage state in Supabase
  Vault, referenced by `integration_connections.vault_secret_id`, loaded into the context for that run only.

## Flow adapter contract

```ts
interface ApplicationFlowAdapter {
  key: string;                                  // e.g. "greenhouse_form"
  matches(url: URL): boolean;
  detect(page): Promise<FormModel | Stop>;      // fields found, or a stop reason
  fill(page, form, data): Promise<FillReport>;  // only verified data
  submit(page): Promise<void>;                  // called only after final checks
  verify(page): Promise<VerificationEvidence | null>;
}
```

## Run steps

1. Open URL → `detect`. Unknown structure → stop (`layout_changed`).
2. Map fields to verified profile data and approved answers; any unmapped required field → stop (`missing_information`).
3. Fill, upload approved documents from Storage, validate each field's value after input.
4. Screenshot (full page) to `automation/<user_id>/<run_id>/<step>.png`.
5. Re-check approval, pause and `evaluateSubmissionWindow(new Date())`; closed → stop without submitting, reschedule.
6. `submit` → `verify`. Evidence (confirmation text/URL) stored in the run log; only then mark `applied`.

## Never

Solve or bypass CAPTCHA · use stealth/fingerprint evasion · reuse another person's session · guess answers ·
retry a submission whose outcome is unknown (mark `failed`, ask the human to check).
