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

```ts
"use server";
export async function doThingAction(input: unknown): Promise<ActionResult> {
  const ctx = await requireUser();                       // 1. authenticate
  const parsed = schema.safeParse(input);                // 2. validate
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    await repository.doThing(ctx, parsed.data);          // 3. act (RLS applies)
  } catch (error) {
    logger.error("feature.thing.failed", { userId: ctx.userId, error });
    return fail("Could not do the thing. Try again.");   // 4. user-safe error
  }
  refresh();                                             // 5. re-render current route
  return ok();
}
```

## Repository rules

- Accept `AuthenticatedContext`; always filter by `ctx.userId` even though RLS also does (defense in depth, better plans).
- Throw `RepositoryError` with `cause` on Supabase errors. Map snake_case rows to camelCase domain types.
- Paginate list queries (`range`) and select only needed columns for lists.

## Service-role usage

Only background workers and the submission service may use a secret-key client. Every query must filter by `user_id`. Never import it from a file reachable by a Client Component.

## Submissions

Call `evaluateSubmissionWindow(new Date(), settings)` and re-read `is_paused` in the same step that performs the final submit. Claim the application with a lock + idempotency key before acting; record an `application_events` row for every transition.
