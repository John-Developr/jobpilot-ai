import "server-only";
import postgres from "postgres";
import { z } from "zod";
import { portfolioDatabaseUrl } from "@/config/server-env";

/**
 * Reads the owner's portfolio database through the `jobpilot_reader` role, which can
 * only SELECT specific columns (see the portfolio repo migration
 * 20261121000100_jobpilot_reader.sql). Every query runs in a READ ONLY transaction.
 */

const nullableText = z.string().nullable();
const date = z.union([z.string(), z.date()]).transform((value) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10),
);

export const portfolioProfileSchema = z.object({
  id: z.string(),
  full_name: nullableText,
  headline: nullableText,
  bio: nullableText,
  phone: nullableText,
  location: nullableText,
  website_url: nullableText,
  github_url: nullableText,
  linkedin_url: nullableText,
  booking_url: nullableText,
  facebook_url: nullableText,
  instagram_url: nullableText,
  x_url: nullableText,
});

export const portfolioExperienceSchema = z.object({
  id: z.string(),
  entry_type: z.enum(["work", "education", "milestone"]),
  company: z.string(),
  position: z.string(),
  employment_type: nullableText,
  location: nullableText,
  start_date: date,
  end_date: date.nullable(),
  description: nullableText,
});

export const portfolioProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  tagline: nullableText,
  description: nullableText,
  role: nullableText,
  organization: nullableText,
  highlights: z.array(z.string()),
  tech: z.array(z.string()),
  live_url: nullableText,
  source_url: nullableText,
  sort_order: z.number().int(),
});

export const portfolioSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_core: z.boolean(),
  category_slug: nullableText,
});

export interface PortfolioSnapshot {
  profile: z.infer<typeof portfolioProfileSchema> | null;
  experiences: z.infer<typeof portfolioExperienceSchema>[];
  projects: z.infer<typeof portfolioProjectSchema>[];
  skills: z.infer<typeof portfolioSkillSchema>[];
}

export class PortfolioUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PortfolioUnavailableError";
  }
}

export type PortfolioConfigState = { state: "ready" } | { state: "missing" } | { state: "invalid"; message: string };

/** Never throws: a misconfigured URL is reported, not crashed on. */
export function portfolioConfigState(): PortfolioConfigState {
  try {
    return portfolioDatabaseUrl() ? { state: "ready" } : { state: "missing" };
  } catch (error) {
    return { state: "invalid", message: error instanceof Error ? error.message : "PORTFOLIO_DATABASE_URL is invalid." };
  }
}

function parseRows<T>(schema: z.ZodType<T>, rows: unknown[], what: string): T[] {
  const parsed = z.array(schema).safeParse(rows);
  if (!parsed.success) {
    throw new PortfolioUnavailableError(
      `The portfolio ${what} data has an unexpected shape. Its schema may have changed.`,
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

export async function readPortfolioSnapshot(): Promise<PortfolioSnapshot> {
  const config = portfolioConfigState();
  if (config.state === "invalid") throw new PortfolioUnavailableError(config.message);
  const url = portfolioDatabaseUrl();
  if (!url) throw new PortfolioUnavailableError("Portfolio sync is not configured (PORTFOLIO_DATABASE_URL).");

  // Supabase pooler (transaction mode) does not support prepared statements.
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10, idle_timeout: 5, ssl: "require" });
  try {
    return await sql.begin("read only", async (tx) => {
      const [profiles, experiences, projects, skills] = await Promise.all([
        tx`select id, full_name, headline, bio, phone, location, website_url, github_url, linkedin_url,
                  booking_url, facebook_url, instagram_url, x_url
             from public.profiles limit 1`,
        tx`select id, entry_type, company, position, employment_type, location, start_date, end_date, description
             from public.experiences order by start_date desc`,
        tx`select id, title, tagline, description, role, organization, highlights, tech, live_url, source_url, sort_order
             from public.projects order by sort_order, title`,
        tx`select s.id, s.name, s.is_core, c.slug as category_slug
             from public.skills s left join public.skill_categories c on c.id = s.category_id
            order by c.slug nulls last, s.sort_order, s.name`,
      ]);
      const [profile] = parseRows(portfolioProfileSchema, [...profiles], "profile");
      return {
        profile: profile ?? null,
        experiences: parseRows(portfolioExperienceSchema, [...experiences], "experience"),
        projects: parseRows(portfolioProjectSchema, [...projects], "project"),
        skills: parseRows(portfolioSkillSchema, [...skills], "skill"),
      };
    });
  } catch (error) {
    if (error instanceof PortfolioUnavailableError) throw error;
    throw new PortfolioUnavailableError("Could not read the portfolio database. Check the connection string and the jobpilot_reader login.", {
      cause: error,
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
