import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/features/auth/schemas";

describe("safeRedirectPath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeRedirectPath("/settings")).toBe("/settings");
    expect(safeRedirectPath("/jobs?page=2")).toBe("/jobs?page=2");
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["absolute URL", "https://evil.example/phish"],
    ["protocol-relative URL", "//evil.example"],
    ["backslash trick", "/\\evil.example"],
    ["relative without slash", "dashboard"],
  ])("falls back to the dashboard for %s", (_label, value) => {
    expect(safeRedirectPath(value)).toBe("/dashboard");
  });
});
