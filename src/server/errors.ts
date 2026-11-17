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
    throw new RepositoryError(`Failed to ${action}`, { cause: error });
  }
  if ("affected" in options && (!options.affected || options.affected.length === 0)) {
    throw new UserFacingError(NOT_FOUND_MESSAGE);
  }
}
