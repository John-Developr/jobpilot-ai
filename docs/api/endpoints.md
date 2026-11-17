# Endpoints

## Pages

| Route | Auth | Purpose |
| --- | --- | --- |
| `/` | — | Redirects to `/dashboard` (`next.config.ts`) |
| `/login` | Public (signed-in users are redirected to `/dashboard`) | Email/password sign-in |
| `/dashboard` | Required | Submission-window status, job pipeline counts, profile readiness |
| `/settings` | Required | Submission schedule, limits, retries, emergency pause |
| `/profile`, `/profile/{experience,skills,education,projects,preferences}` | Required | Professional profile management |
| `/resumes` | Required | Resume versions and files |
| `/jobs` | Required | Job list; query params `q`, `location`, `minSalary`, `remote`, `type`, `source`, `status` (active, archived, all), `page`; invalid values fall back to defaults |
| `/jobs/[id]` | Required | Job detail |
| `/jobs/sources` | Required | Source configuration and Sync now |

## Server Actions

| Action | File | Input | Result | Notes |
| --- | --- | --- | --- | --- |
| `signInAction(input, next)` | `features/auth/server/actions.ts` | `{ email, password }`, `next: string \| null` | Redirect on success; `ActionResult` failure | `next` must be a same-origin relative path; generic error message (no account enumeration); 429 → rate-limit message |
| `signOutAction()` | same | — | Redirect `/login` | Form action |
| `updateAutomationScheduleAction(input)` | `features/settings/server/actions.ts` | `automationScheduleSchema`: isEnabled, timezone (IANA), workingDays (1–7, unique), windowStart/End (HH:MM, start < end), dailyApplicationLimit 0–100, minMatchScore 0–100, maxRetries 0–10, retryBackoffMinutes 1–1440 | `ActionResult` with `fieldErrors` | Refreshes current route |
| `setEmergencyPauseAction(input)` | same | `{ paused: true, reason? (≤200) }` or `{ paused: false }` | `ActionResult<{ paused }>` | Sets/clears `is_paused`, `paused_at`, `paused_reason`; logged as `automation.emergency_pause.change` |

### Profile — `features/profile/server/actions.ts`

All return `ActionResult<null>`. Update actions take `{ id: uuid, values }` where `values` matches the create schema.

| Actions | Schema (`features/profile/schemas.ts`) |
| --- | --- |
| `updatePersonalInfoAction` | `personalInfoSchema` (fullName required, headline, phone, location, yearsOfExperience 0–60, summary ≤ 3000) |
| `updatePreferencesAction` | `preferencesSchema` (titles, locations, employment types ≥ 1, remote/hybrid/onsite ≥ 1, salary min ≤ max, ISO currency, period) |
| `createLinkAction` / `updateLinkAction` | `linkSchema` (label, http(s) URL) |
| `createExperienceAction` / `updateExperienceAction` | `experienceSchema` (YYYY-MM months; past roles need an end; current roles must not have one; end ≥ start) |
| `createSkillAction` / `updateSkillAction` / `bulkCreateSkillsAction` | `skillSchema`, `bulkSkillsSchema` (duplicates skipped case-insensitively) |
| `createEducationAction` / `updateEducationAction` | `educationSchema` |
| `createCertificationAction` / `updateCertificationAction` | `certificationSchema` |
| `createProjectAction` / `updateProjectAction` | `projectSchema` |
| `syncFromPortfolioAction` | none — returns `{ updated: { section: count }, skipped: string[] }`; needs `PORTFOLIO_DATABASE_URL` |
| `deleteProfileItemAction` | `{ kind, id }` — kind is one of link, experience, skill, education, certification, project |

### Resumes — `features/resumes/server/actions.ts`

| Action | Input | Notes |
| --- | --- | --- |
| `createResumeAction` / `updateResumeAction` | `resumeSchema` | First resume becomes default |
| `setDefaultResumeAction` | `{ id }` | Calls `set_default_resume` RPC |
| `deleteResumeAction` | `{ id }` | Deletes the stored file first, then the row |
| `prepareResumeUploadAction` | `{ resumeId, mimeType, size }` — PDF or DOCX, ≤ 10 MB | Returns `{ path, token }` for a signed upload |
| `confirmResumeUploadAction` | `{ resumeId, path }` | Path must be under `<uid>/resumes/<resumeId>/`; type/size re-checked from storage metadata; previous file removed |
| `removeResumeFileAction` | `{ id }` | Removes file and clears columns |

### Jobs — `features/jobs/server/actions.ts`

| Action | Input | Notes |
| --- | --- | --- |
| `addManualJobAction` | `manualJobSchema` | Returns `{ jobId }`; duplicate gives "already in your list" |
| `prefillJobAction` | `{ url }` | Returns a JobPosting draft; blocked hosts and private addresses refused |
| `setJobArchivedAction` | `{ jobId, archived }` | Calls `set_job_archived`; approved/submitted jobs cannot be archived |
| `deleteJobAction` | `{ jobId }` | Only before approval |
| `saveSourceAction` | `{ key, isEnabled, config: { companies?, keywords } }` | Config validated by the connector schema |
| `syncSourceAction` | `{ key }` | Returns `{ fetched, matched, inserted, skipped, warnings }`; 10-minute cooldown |

### Application Studio — `features/studio/server/actions.ts`

| Action | Input | Notes |
| --- | --- | --- |
| `generateDocumentAction` | `{ applicationId, kind, instructions ≤ 1000 }` | New AI version; returns `{ version, flags, notes }` |
| `saveDocumentAction` | `{ applicationId, kind, content ≤ 50,000 }` | New manual version; grounding re-checked |
| `restoreVersionAction` | `{ applicationId, kind, version }` | Copies an old version forward |
| `setApplicationResumeAction` | `{ applicationId, resumeId }` (resumeId may be null) | null = default resume |
| `markReadyAction` | `{ applicationId, confirmFlags }` | → pending_approval |
| `createAnswerAction` / `updateAnswerAction` / `deleteAnswerAction` | question / `{ id, values }` / `{ id }` | Manual edits set source "user" |
| `generateAnswerAction` | `{ id }` | Draft, always unverified; returns confidence and missing info |

Pages: `/application-studio`, `/application-studio/[id]`, `/print/applications/[id]?kind=&version=` (print-only view).

### Ask JobPilot — `features/assistant/server/actions.ts`

| Action | Input | Notes |
| --- | --- | --- |
| `loadAssistantAction` | none | `{ aiReady, threads }` (30 most recent) |
| `loadThreadAction` | `{ threadId }` | Messages, oldest first |
| `deleteAssistantThreadAction` | `{ threadId }` | Deletes the conversation and its messages |

None of these refresh the current route. Questions go to `POST /api/assistant/messages` (Route Handlers, below) so progress can stream. The panel is part of the app shell (`src/app/(app)/layout.tsx`).

### Evaluation — `features/evaluation/server/actions.ts`

| Action | Input | Notes |
| --- | --- | --- |
| `evaluateJobAction` | `{ jobId, force }` | Returns `{ score, qualification, status, cached }`; `force` skips the cache |
| `evaluateJobInBatchAction` | same | No route refresh (used by the batch loop) |
| `listUnevaluatedJobsAction` | none | Up to 25 newest unscored, non-archived job ids + total |
| `updateScoringWeightsAction` (settings) | six integer weights 0–100, sum > 0 | Weights are relative |

## Route Handlers

| Route | Method | Auth | Behavior |
| --- | --- | --- | --- |
| `/resumes/[id]/file` | GET | Required | 302 to a 60-second signed download URL; 404 if missing/not owned |
| `/api/assistant/messages` | POST | Required; same-origin only (403 otherwise) | Body `{ threadId or null, message ≤ 4000, page }`. 400 on invalid input. Streams NDJSON events: `thinking {step}`, `tools {names}`, `text {delta}`, then `done {threadId, messages}` or `error {message}`. Question and answer are saved together only after the answer completes. |

Planned: `/api/trigger/*` webhooks (Phase 6), `/api/exports/[documentId]` (Phase 5), `/api/health` (Phase 9).
