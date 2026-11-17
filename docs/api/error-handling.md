# Error handling

## Layers

| Where | Mechanism |
| --- | --- |
| Repository | Throws `RepositoryError` (`src/server/errors.ts`) with the Supabase error as `cause` |
| Server Action | Catches, logs `logger.error("<area>.<subject>.failed", { userId, error })`, returns `fail("<user-safe message>")` |
| Validation | `validationFailure(zodError)` → `{ ok: false, error, fieldErrors: { "<path>": [messages] } }` |
| Server Component read | Unhandled errors bubble to the route `error.tsx` → `ErrorState` with retry |
| Auth | Missing/invalid session → redirect to `/login` (proxy and `requireUser`) |
| Client | Forms map `fieldErrors` to fields; `toast.error(result.error)` for the rest |

## Error codes

Server Actions return messages, not codes, because the only consumer is the UI. Route Handlers (when added) will
return JSON `{ error: { code, message } }` with these codes:

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `validation_failed` | Input failed schema validation |
| 401 | `unauthenticated` | No valid session / signature |
| 403 | `forbidden` | Authenticated but not allowed |
| 404 | `not_found` | Resource missing or not owned (indistinguishable by design) |
| 409 | `conflict` | Duplicate / idempotency or lock conflict |
| 423 | `outside_window` | Submission attempted outside the submission window or while paused |
| 429 | `rate_limited` | Daily limit or provider rate limit |
| 500 | `internal_error` | Unexpected; see logs |

## Logging rules

Structured JSON (`src/lib/monitoring/logger.ts`). Include `userId` and entity ids. Never log passwords,
tokens, API keys, resume/cover-letter content or full job descriptions.
