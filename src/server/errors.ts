/** Thrown by repositories when a database call fails. The cause keeps the Postgres error for logs. */
export class RepositoryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RepositoryError";
  }
}

/** Thrown when the user should see this exact message (e.g. duplicates, missing rows). */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

const UNIQUE_VIOLATION = "23505";
const NOT_FOUND_MESSAGE = "This item no longer exists. Refresh the page.";

interface PostgrestLikeError {
  code?: string;
  message: string;
}

/**
 * Interprets the result of an insert/update/delete.
 * - unique violation → UserFacingError(duplicateMessage)
 * - rule violation raised by a trigger (22023) → UserFacingError(its message)
 * - other error → RepositoryError
 * - `affected` given and empty → UserFacingError (row missing or not owned; RLS hides both)
 */
export function assertMutation(
  action: string,
  error: PostgrestLikeError | null,
  options: { affected?: unknown[] | null; duplicateMessage?: string } = {},
): void {
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new UserFacingError(options.duplicateMessage ?? "That entry already exists.");
    }
    // Triggers raise rule violations with user-safe messages (e.g. edits locked during submission).
    throwRpcError(action, error);
  }
  if ("affected" in options && (!options.affected || options.affected.length === 0)) {
    throw new UserFacingError(NOT_FOUND_MESSAGE);
  }
}

/** Postgres error codes our SQL functions raise with messages written for the user. */
const USER_FACING_SQL_CODES = new Set(["22023", "P0002"]);

/**
 * Rethrows the error of an RPC to one of our SQL functions: rule violations (`22023`)
 * and missing rows (`P0002`) carry a user-safe message; anything else is a RepositoryError.
 * Call as `if (error) throwRpcError(...)` so TypeScript narrows the result.
 */
export function throwRpcError(action: string, error: PostgrestLikeError): never {
  if (error.code && USER_FACING_SQL_CODES.has(error.code)) {
    throw new UserFacingError(error.message.replace(/^./, (c) => c.toUpperCase()).replace(/\.?$/, "."));
  }
  throw new RepositoryError(`Failed to ${action}`, { cause: error });
}
