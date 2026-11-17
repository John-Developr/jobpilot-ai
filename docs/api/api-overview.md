# API overview

## Style

- **Server Actions** for all mutations from the UI (typed, CSRF-protected by Next.js, no public URL contract).
- **Server Components** read through feature repositories; there is no internal REST layer for the app's own UI.
- **Route Handlers** (`src/app/api/**`) only where an HTTP contract is required: webhooks (Trigger.dev, email),
  file downloads/exports, health checks. None exist yet.

## Authorization

1. `src/proxy.ts` — refreshes the session, redirects anonymous users (optimistic, not a security boundary).
2. `requireUser()` — verifies the JWT (`getClaims`) at every read/mutation entry point.
3. Postgres RLS + column grants — final enforcement for every query made with the user's JWT.
4. Background workers (planned) use the secret key and must filter by `user_id` explicitly.

## Contracts

- Inputs are `unknown` at the boundary and parsed with the feature's Zod schema.
- Server Actions return `ActionResult<T>` — `{ ok: true, data }` or `{ ok: false, error, fieldErrors? }`.
- Errors are user-safe strings; details go to structured logs. See [error-handling.md](error-handling.md).

Endpoint list: [endpoints.md](endpoints.md).
