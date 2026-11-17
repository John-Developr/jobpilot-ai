import "server-only";
import { refresh } from "next/cache";
import type { z } from "zod";
import { requireUser, type AuthenticatedContext } from "@/server/auth";
import { fail, ok, validationFailure, type ActionResult } from "@/server/action-result";
import { logger } from "@/lib/monitoring/logger";
import { UserFacingError } from "@/server/errors";

interface RunActionOptions<S extends z.ZodType, T> {
  schema: S;
  input: unknown;
  /** Log event prefix, e.g. "profile.skill.create". Suffixed with ".failed" on error. */
  event: string;
  /** Message shown when an unexpected error occurs. */
  failMessage: string;
  run: (ctx: AuthenticatedContext, data: z.output<S>) => Promise<T>;
  /** Re-render the current route after success (default true). */
  refreshRoute?: boolean;
}

/**
 * Standard Server Action pipeline: authenticate → validate → run → log → refresh.
 * Authorization is enforced by `requireUser` here and by RLS in the database.
 */
export async function runAction<S extends z.ZodType, T>({
  schema,
  input,
  event,
  failMessage,
  run,
  refreshRoute = true,
}: RunActionOptions<S, T>): Promise<ActionResult<T>> {
  const ctx = await requireUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  let data: T;
  try {
    data = await run(ctx, parsed.data);
  } catch (error) {
    if (error instanceof UserFacingError) return fail(error.message);
    logger.error(`${event}.failed`, { userId: ctx.userId, error });
    return fail(failMessage);
  }
  logger.info(event, { userId: ctx.userId });
  if (refreshRoute) refresh();
  return ok(data);
}
