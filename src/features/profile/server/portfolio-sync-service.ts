import "server-only";
import { z } from "zod";
import type { AuthenticatedContext } from "@/server/auth";
import { RepositoryError, UserFacingError } from "@/server/errors";
import { logger } from "@/lib/monitoring/logger";
import {
  portfolioConfigState,
  PortfolioUnavailableError,
  type PortfolioConfigState,
  readPortfolioSnapshot,
} from "@/lib/integrations/portfolio/reader";
import { mapPortfolioSnapshot, type LocalItems } from "../portfolio-mapping";

export interface PortfolioSyncStatus {
  config: PortfolioConfigState;
  lastSyncedAt: string | null;
}

export interface PortfolioSyncResult {
  updated: Record<string, number>;
  skipped: string[];
}

const countsSchema = z.record(z.string(), z.number());

export async function getPortfolioSyncStatus({ supabase, userId }: AuthenticatedContext): Promise<PortfolioSyncStatus> {
  const { data, error } = await supabase.from("profiles").select("portfolio_synced_at").eq("id", userId).maybeSingle();
  if (error) throw new RepositoryError("Failed to load portfolio sync status", { cause: error });
  return { config: portfolioConfigState(), lastSyncedAt: data?.portfolio_synced_at ?? null };
}

async function loadLocalItems({ supabase, userId }: AuthenticatedContext): Promise<LocalItems> {
  const [links, experiences, education, skills, projects] = await Promise.all([
    supabase.from("profile_links").select("id, url, portfolio_ref").eq("user_id", userId),
    supabase.from("professional_experiences").select("id, company, start_date, portfolio_ref").eq("user_id", userId),
    supabase.from("education").select("id, institution, portfolio_ref").eq("user_id", userId),
    supabase.from("professional_skills").select("id, name, portfolio_ref").eq("user_id", userId),
    supabase.from("projects").select("id, name, portfolio_ref").eq("user_id", userId),
  ]);
  for (const result of [links, experiences, education, skills, projects]) {
    if (result.error) throw new RepositoryError("Failed to load profile items", { cause: result.error });
  }
  return {
    links: (links.data ?? []).map((r) => ({ id: r.id, url: r.url, portfolioRef: r.portfolio_ref })),
    experiences: (experiences.data ?? []).map((r) => ({
      id: r.id,
      company: r.company,
      startDate: r.start_date,
      portfolioRef: r.portfolio_ref,
    })),
    education: (education.data ?? []).map((r) => ({ id: r.id, institution: r.institution, portfolioRef: r.portfolio_ref })),
    skills: (skills.data ?? []).map((r) => ({ id: r.id, name: r.name, portfolioRef: r.portfolio_ref })),
    projects: (projects.data ?? []).map((r) => ({ id: r.id, name: r.name, portfolioRef: r.portfolio_ref })),
  };
}

/**
 * Copies the portfolio (read-only source) into JobPilot. Portfolio values win for
 * the fields it has; JobPilot-only fields are kept; matching local rows are linked.
 */
export async function syncFromPortfolio(ctx: AuthenticatedContext): Promise<PortfolioSyncResult> {
  let snapshot;
  try {
    snapshot = await readPortfolioSnapshot();
  } catch (error) {
    if (error instanceof PortfolioUnavailableError) {
      logger.error("profile.portfolio_sync.read_failed", { userId: ctx.userId, error });
      throw new UserFacingError(error.message);
    }
    throw error;
  }

  const { payload, skipped } = mapPortfolioSnapshot(snapshot, await loadLocalItems(ctx));
  const { data, error } = await ctx.supabase.rpc("apply_portfolio_sync", { p_snapshot: payload });
  if (error) throw new RepositoryError("Failed to apply portfolio snapshot", { cause: error });

  const updated = countsSchema.safeParse(data);
  return { updated: updated.success ? updated.data : {}, skipped };
}
