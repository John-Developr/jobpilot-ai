import "server-only";
import { z } from "zod";

/**
 * Server-only secrets. Never import from a Client Component.
 * Optional integrations resolve to `null` when not configured, so the app runs without them.
 */
const portfolioUrlSchema = z
  .string()
  .regex(/^postgres(ql)?:\/\/[^:@\s]+:[^@\s]+@[^/\s]+\/\S+$/, "Must be a postgres:// connection string with user and password");

export const AI_PROVIDERS = ["gemini", "openai"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** Env variable holding each provider's API key (named in setup messages). */
export const AI_KEY_VARIABLE: Record<AiProvider, string> = { gemini: "GEMINI_API_KEY", openai: "OPENAI_API_KEY" };

export interface AiCredentials {
  provider: AiProvider;
  /** In order of use; later keys are fallbacks when earlier ones hit limits or are rejected. */
  apiKeys: string[];
}

/**
 * Keys for a provider: `<NAME>`, then `<NAME>2`, `<NAME>_3`, … in numeric order
 * (e.g. GEMINI_API_KEY, GEMINI_API_KEY2, GEMINI_API_KEY3). Empty and duplicate values are ignored.
 */
export function providerKeys(provider: AiProvider, env: Record<string, string | undefined> = process.env): string[] {
  const base = AI_KEY_VARIABLE[provider];
  const pattern = new RegExp(`^${base}_?(\\d*)$`);
  const numbered = Object.entries(env)
    .map(([name, value]) => ({ order: pattern.exec(name)?.[1], value: value?.trim() }))
    .filter((entry): entry is { order: string; value: string } => entry.order !== undefined && Boolean(entry.value))
    .sort((a, b) => (a.order === "" ? 1 : Number(a.order)) - (b.order === "" ? 1 : Number(b.order)));
  return [...new Set(numbered.map((entry) => entry.value))];
}

/**
 * The AI provider and its keys; `null` when AI features are not configured.
 * `AI_PROVIDER` picks the provider; when unset, Gemini is used if a Gemini key is present, otherwise OpenAI.
 */
export function aiCredentials(): AiCredentials | null {
  const setting = process.env.AI_PROVIDER?.trim().toLowerCase();
  const provider: AiProvider =
    AI_PROVIDERS.find((p) => p === setting) ?? (providerKeys("gemini").length > 0 ? "gemini" : "openai");
  const apiKeys = providerKeys(provider);
  return apiKeys.length > 0 ? { provider, apiKeys } : null;
}

/**
 * Optional models for every prompt, in fallback order: `AI_MODEL=gemini-2.5-flash,gemini-3-flash-preview`.
 * Null when unset or invalid (then the provider defaults apply).
 */
export function aiModelOverrides(): string[] | null {
  const models = (process.env.AI_MODEL ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter((model) => /^[A-Za-z0-9._:-]{1,100}$/.test(model));
  return models.length > 0 ? [...new Set(models)] : null;
}

/**
 * Secret key for background workers (bypasses RLS). Only `src/lib/supabase/service.ts` reads
 * it, and only worker code (`src/trigger/**`) may import that module (lint-enforced).
 */
export function supabaseSecretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set. See docs/deployment/environment-variables.md.");
  return key;
}

/**
 * Only the least-privilege `jobpilot_reader` role is accepted (optionally suffixed with
 * the project ref for the Supabase pooler). Admin logins such as `postgres` are refused
 * so JobPilot can never hold write access to the portfolio.
 */
export function isPortfolioReaderUser(user: string): boolean {
  return /^jobpilot_reader(\.[a-z0-9]{20})?$/.test(user);
}

export function portfolioDatabaseUrl(): string | null {
  const raw = process.env.PORTFOLIO_DATABASE_URL?.trim();
  if (!raw) return null;
  const parsed = portfolioUrlSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("PORTFOLIO_DATABASE_URL is invalid. See docs/deployment/environment-variables.md.");
  }
  const user = decodeURIComponent(new URL(parsed.data).username);
  if (!isPortfolioReaderUser(user)) {
    throw new Error(
      "PORTFOLIO_DATABASE_URL must use the read-only jobpilot_reader login, not an admin user. See docs/deployment/environment-variables.md.",
    );
  }
  return parsed.data;
}
