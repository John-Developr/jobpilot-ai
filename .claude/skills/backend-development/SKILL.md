---
name: backend-development
description: How to write JobPilot AI server code — feature repositories, Server Actions, validation, authorization, error handling and logging. Load before adding or changing anything in src/server or src/features/*/server.
---

# Backend development

## Feature layout

```
src/features/<feature>/
  schemas.ts                 # Zod schemas + inferred types (shared by client and server)
  server/<entity>-repository.ts   # Supabase queries, row ↔ domain mapping ("server-only")
  server/actions.ts          # "use server" entry points
  server/<name>-service.ts   # only when logic spans repositories or needs unit tests
  components/
```

## Server Action template

Use `runAction` (`src/server/run-action.ts`); it authenticates, validates, maps `UserFacingError` to the message,
logs `<event>` / `<event>.failed` and calls `refresh()`.

```ts
"use server";
export async function doThingAction(input: unknown): Promise<ActionResult<null>> {
  return runAction({
    schema: doThingSchema,            // Zod, shared with the client form
    input,
    event: "feature.thing.update",
    failMessage: "Could not save. Try again.",
    run: async (ctx, data) => {
      await repository.doThing(ctx, data);
      return null;
    },
    // refreshRoute: false  — for reads or actions used outside the current page (e.g. the assistant panel)
  });
}
```

Schemas have no transforms, so client and server validate with the same schema. Updates take `{ id, values }`.

## Streaming Route Handlers

Server Actions cannot stream. For live progress, use a Route Handler that returns NDJSON (one JSON event per line),
like `src/app/api/assistant/messages/route.ts`:

1. Check `Origin` against `Host` / `X-Forwarded-Host` (CSRF) — Route Handlers do not get the Server Action check.
2. `requireUser()`, then validate the body with Zod (400 on failure).
3. Stream events from a `ReadableStream`; finish with `done` or `error`. Map `UserFacingError` to its message; log
   anything else and send a generic message.
4. Define the event union as a Zod schema in the feature's `schemas.ts` and validate each line on the client.

## Repository rules

- Accept `AuthenticatedContext`; always filter by `ctx.userId` even though RLS also does (defense in depth, better plans).
- Throw `RepositoryError` with `cause` on Supabase errors. Map snake_case rows to camelCase domain types.
- Paginate list queries (`range`) and select only needed columns for lists.
- Use `assertMutation(action, error, { affected })` after insert/update/delete; an empty `affected` means the row is missing or not owned.
- After an RPC to our SQL functions use `if (error) throwRpcError(action, error)`: `22023` (rule violation) and `P0002` (not found) become a `UserFacingError` with the SQL message, anything else a `RepositoryError`. Write SQL `raise` messages for the user.
- Application status changes only through SQL functions (users hold no UPDATE on status); new transitions must be added to `application_transition_allowed`.
- Multi-row inserts send columns missing from a row as `null` (not the default): list every column on every row.
- Several writes that must succeed together go in one `security invoker` SQL function called with `.rpc()`.

## Service-role usage

Only background workers and the submission service may use a secret-key client. Every query must filter by `user_id`. Never import it from a file reachable by a Client Component.

## Submissions

Call `evaluateSubmissionWindow(new Date(), settings)` and re-read `is_paused` in the same step that performs the final submit. Claim the application with a lock + idempotency key before acting; record an `application_events` row for every transition.
