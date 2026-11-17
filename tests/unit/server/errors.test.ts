import { describe, expect, it } from "vitest";
import { assertMutation, RepositoryError, throwRpcError, UserFacingError } from "@/server/errors";

describe("throwRpcError", () => {
  it("shows rule violations and missing rows as sentences", () => {
    expect(() => throwRpcError("approve", { code: "22023", message: "verify every screening answer before approving" })).toThrow(
      new UserFacingError("Verify every screening answer before approving."),
    );
    expect(() => throwRpcError("approve", { code: "P0002", message: "application not found" })).toThrow(UserFacingError);
  });

  it("hides other database errors", () => {
    expect(() => throwRpcError("approve", { code: "42501", message: "permission denied for table applications" })).toThrow(
      RepositoryError,
    );
  });
});

describe("assertMutation", () => {
  it("passes trigger rule violations through to the user", () => {
    expect(() =>
      assertMutation("update answer", { code: "22023", message: "this application is being submitted; its documents are locked" }),
    ).toThrow(new UserFacingError("This application is being submitted; its documents are locked."));
  });
});
