# Quality checklist

Copy into the PR description and tick what applies.

## Feature completeness
- [ ] Requirements implemented (link roadmap item)
- [ ] UI complete with loading, empty and error states
- [ ] No placeholder data, fake numbers or non-functional controls
- [ ] Responsive at 390 / 768 / 1280 px, light and dark

## Server
- [ ] `requireUser()` at every entry point
- [ ] Zod validation of all inputs and external payloads
- [ ] Errors logged with structured events; user-safe messages returned
- [ ] Long-running work moved to background tasks

## Database
- [ ] New migration file (no edits to applied ones)
- [ ] RLS + policies + indexes + constraints
- [ ] Migration tests added
- [ ] `src/types/database.ts` and schema docs updated

## Safety (when touching the pipeline)
- [ ] Approval still required
- [ ] Window and pause re-checked with server time right before submit
- [ ] Idempotency / locks / one-per-job preserved
- [ ] No unverified `applied`
- [ ] No CAPTCHA/anti-bot bypass; stops for human input

## Verification
- [ ] `pnpm check` passes
- [ ] `pnpm build` passes
- [ ] Manual check performed (describe) or reason it could not be

## Docs
- [ ] Relevant docs updated
- [ ] `docs/changelog.md` updated
- [ ] Roadmap status / limitations updated
