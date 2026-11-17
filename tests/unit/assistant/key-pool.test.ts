import { describe, expect, it, vi } from "vitest";
import { classifyFailure, KeyPool, parseRetryDelay } from "@/lib/ai/key-pool";

vi.mock("server-only", () => ({}));
const { aiModelOverrides, providerKeys } = await import("@/config/server-env");

const MINUTE = 60_000;
const MODELS = ["fast", "fallback"];

describe("KeyPool", () => {
  it("tries the preferred model on every key, in key order, before the next model", () => {
    const pool = new KeyPool(["a", "b"]);
    expect(pool.next(0, MODELS)).toEqual({ keyIndex: 0, model: "fast" });
    pool.park({ keyIndex: 0, model: "fast" }, { kind: "limit", retryAfterMs: 30_000, daily: false }, 0);
    expect(pool.next(0, MODELS)).toEqual({ keyIndex: 1, model: "fast" });
    pool.park({ keyIndex: 1, model: "fast" }, { kind: "model_unavailable" }, 0);
    expect(pool.next(0, MODELS)).toEqual({ keyIndex: 0, model: "fallback" });
    expect(pool.next(30_000, MODELS)).toEqual({ keyIndex: 0, model: "fast" });
  });

  it("parks a rejected key for every model and an overloaded model for every key", () => {
    const pool = new KeyPool(["a", "b"]);
    pool.park({ keyIndex: 0, model: "fast" }, { kind: "rejected" }, 0);
    expect(pool.next(0, MODELS)).toEqual({ keyIndex: 1, model: "fast" });
    expect(pool.next(0, ["fallback"])).toEqual({ keyIndex: 1, model: "fallback" });
    pool.park({ keyIndex: 1, model: "fast" }, { kind: "overloaded" }, 0);
    expect(pool.next(0, MODELS)).toEqual({ keyIndex: 1, model: "fallback" });
    expect(pool.next(2 * MINUTE, MODELS)).toEqual({ keyIndex: 1, model: "fast" });
  });

  it("parks daily limits for at least an hour and skips pairs already tried", () => {
    const pool = new KeyPool(["a"]);
    expect(pool.park({ keyIndex: 0, model: "fast" }, { kind: "limit", retryAfterMs: 5_000, daily: true }, 0)).toBe(60 * MINUTE);
    expect(pool.next(59 * MINUTE, ["fast"])).toBeNull();
    expect(pool.nextAvailableAt(["fast"])).toBe(60 * MINUTE);
    expect(pool.next(0, ["other"], new Set(["0|other"]))).toBeNull();
  });
});

describe("classifyFailure", () => {
  it("treats 429 as a limit and reads Google's retry hint and daily quota", () => {
    const body = [{ error: { message: "Quota exceeded for metric generate_content_free_tier_requests, limit: 250 PerDay", details: [{ retryDelay: "37s" }] } }];
    expect(classifyFailure(429, "429 quota", body)).toEqual({ kind: "limit", retryAfterMs: 37_000, daily: true });
    expect(classifyFailure(429, "429 Too many requests", null)).toEqual({ kind: "limit", retryAfterMs: null, daily: false });
  });

  it("classifies rejected keys, unavailable and overloaded models; leaves other errors alone", () => {
    expect(classifyFailure(401, "", null)).toEqual({ kind: "rejected" });
    expect(classifyFailure(403, "", null)).toEqual({ kind: "rejected" });
    expect(classifyFailure(400, "API key not valid", null)).toEqual({ kind: "rejected" });
    expect(classifyFailure(404, "no longer available to new users", null)).toEqual({ kind: "model_unavailable" });
    expect(classifyFailure(503, "high demand", null)).toEqual({ kind: "overloaded" });
    expect(classifyFailure(400, "Request contains an invalid argument.", null)).toBeNull();
    expect(classifyFailure(500, "internal", null)).toBeNull();
  });

  it("parses retry delays", () => {
    expect(parseRetryDelay("1.5s")).toBe(1_500);
    expect(parseRetryDelay("soon")).toBeNull();
    expect(parseRetryDelay(undefined)).toBeNull();
  });
});

describe("environment", () => {
  it("orders numbered keys, accepts KEY2 and KEY_3 forms, drops blanks and duplicates", () => {
    const env = {
      GEMINI_API_KEY3: "c",
      GEMINI_API_KEY: "a",
      GEMINI_API_KEY_2: "b",
      GEMINI_API_KEY4: " ",
      GEMINI_API_KEY5: "a",
      GEMINI_API_KEY_SPARE: "x",
      OPENAI_API_KEY: "o",
    };
    expect(providerKeys("gemini", env)).toEqual(["a", "b", "c"]);
    expect(providerKeys("openai", env)).toEqual(["o"]);
  });

  it("reads AI_MODEL as an ordered, de-duplicated list", () => {
    const original = process.env.AI_MODEL;
    process.env.AI_MODEL = "gemini-2.5-flash, gemini-3-flash-preview,gemini-2.5-flash, bad model";
    expect(aiModelOverrides()).toEqual(["gemini-2.5-flash", "gemini-3-flash-preview"]);
    process.env.AI_MODEL = "";
    expect(aiModelOverrides()).toBeNull();
    process.env.AI_MODEL = original;
  });
});
