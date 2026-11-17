import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { isPortfolioReaderUser, portfolioDatabaseUrl } = await import("@/config/server-env");

const ORIGINAL = process.env.PORTFOLIO_DATABASE_URL;
afterEach(() => {
  process.env.PORTFOLIO_DATABASE_URL = ORIGINAL;
});

describe("portfolio database URL", () => {
  it("accepts only the read-only role", () => {
    expect(isPortfolioReaderUser("jobpilot_reader")).toBe(true);
    expect(isPortfolioReaderUser("jobpilot_reader.abcdefghijklmnopqrst")).toBe(true);
    expect(isPortfolioReaderUser("postgres")).toBe(false);
    expect(isPortfolioReaderUser("postgres.abcdefghijklmnopqrst")).toBe(false);
    expect(isPortfolioReaderUser("jobpilot_reader.Portfolio")).toBe(false);
  });

  it("refuses admin connection strings", () => {
    process.env.PORTFOLIO_DATABASE_URL = "postgresql://postgres.abcdefghijklmnopqrst:secret@aws-0-x.pooler.supabase.com:6543/postgres";
    expect(() => portfolioDatabaseUrl()).toThrow(/jobpilot_reader/);
  });

  it("returns null when unset and the URL when valid", () => {
    process.env.PORTFOLIO_DATABASE_URL = "";
    expect(portfolioDatabaseUrl()).toBeNull();
    const url = "postgresql://jobpilot_reader.abcdefghijklmnopqrst:secret@aws-0-x.pooler.supabase.com:6543/postgres";
    process.env.PORTFOLIO_DATABASE_URL = url;
    expect(portfolioDatabaseUrl()).toBe(url);
  });
});
