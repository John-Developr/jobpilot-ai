import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { fetchPublicHtml, isPrivateAddress } = await import("@/lib/integrations/safe-fetch");

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"])(
    "blocks %s",
    (address) => expect(isPrivateAddress(address)).toBe(true),
  );

  it.each(["8.8.8.8", "104.18.38.10", "2606:4700::6810:260a"])("allows %s", (address) =>
    expect(isPrivateAddress(address)).toBe(false),
  );
});

describe("fetchPublicHtml URL checks (no network)", () => {
  it.each([
    ["http://example.com", /Only https/],
    ["https://127.0.0.1/admin", /not a public website/],
    ["https://[::1]/", /not a public website/],
    ["https://localhost:3000", /not a public website/],
    ["https://printer.local/", /not a public website/],
    ["https://user:pass@example.com", /credentials/],
    ["not a url", /valid URL/],
  ])("rejects %s", async (url, message) => {
    await expect(fetchPublicHtml(url)).rejects.toThrow(message);
  });
});
