import "server-only";
import type { AuthenticatedContext } from "@/server/auth";
import { assertMutation, RepositoryError } from "@/server/errors";
import type { Json, Tables } from "@/types/database";
import { JOB_SOURCE_CATALOG, type ConnectorKey } from "@/lib/integrations/job-sources/catalog";

export interface SourceState {
  key: ConnectorKey;
  id: string | null;
  isEnabled: boolean;
  config: { companies: string[]; keywords: string[] };
  lastSyncedAt: string | null;
  lastError: string | null;
  jobCount: number;
}

const stringList = (value: Json | undefined): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** Reads stored config leniently; the connector schema re-validates before any sync. */
function configFromJson(config: Json): SourceState["config"] {
  const object = typeof config === "object" && config !== null && !Array.isArray(config) ? config : {};
  return { companies: stringList(object.companies), keywords: stringList(object.keywords) };
}

export async function getSourceRow(
  { supabase, userId }: AuthenticatedContext,
  key: ConnectorKey,
): Promise<Tables<"job_sources"> | null> {
  const { data, error } = await supabase
    .from("job_sources")
    .select("*")
    .eq("user_id", userId)
    .eq("connector_key", key)
    .maybeSingle();
  if (error) throw new RepositoryError("Failed to load job source", { cause: error });
  return data;
}

/** One state per catalog entry, merged with the user's stored row and job count. */
export async function listSourceStates(ctx: AuthenticatedContext): Promise<SourceState[]> {
  const { supabase, userId } = ctx;
  const { data: rows, error } = await supabase.from("job_sources").select("*").eq("user_id", userId);
  if (error) throw new RepositoryError("Failed to load job sources", { cause: error });

  const keys = Object.keys(JOB_SOURCE_CATALOG) as ConnectorKey[];
  return Promise.all(
    keys.map(async (key): Promise<SourceState> => {
      const row = rows.find((r) => r.connector_key === key) ?? null;
      let jobCount = 0;
      if (row) {
        const { count, error: countError } = await supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("source_id", row.id);
        if (countError) throw new RepositoryError("Failed to count source jobs", { cause: countError });
        jobCount = count ?? 0;
      }
      return {
        key,
        id: row?.id ?? null,
        isEnabled: row?.is_enabled ?? false,
        config: row ? configFromJson(row.config) : { companies: [], keywords: [] },
        lastSyncedAt: row?.last_synced_at ?? null,
        lastError: row?.last_error ?? null,
        jobCount,
      };
    }),
  );
}

/** Creates or updates the user's row for a connector. Returns its id. */
export async function upsertSource(
  { supabase, userId }: AuthenticatedContext,
  key: ConnectorKey,
  values: { isEnabled: boolean; config: Json },
): Promise<string> {
  const entry = JOB_SOURCE_CATALOG[key];
  const { data, error } = await supabase
    .from("job_sources")
    .upsert(
      {
        user_id: userId,
        connector_key: key,
        name: entry.name,
        kind: entry.kind,
        is_enabled: values.isEnabled,
        config: values.config,
      },
      { onConflict: "user_id,connector_key" },
    )
    .select("id")
    .single();
  assertMutation("save job source", error);
  if (!data) throw new RepositoryError("Job source upsert returned no row");
  return data.id;
}

/** The manual source always exists once used; created on first manual job. */
export async function ensureManualSource(ctx: AuthenticatedContext): Promise<string> {
  const existing = await getSourceRow(ctx, "manual");
  if (existing) return existing.id;
  return upsertSource(ctx, "manual", { isEnabled: true, config: {} });
}

export async function recordSync(
  { supabase, userId }: AuthenticatedContext,
  sourceId: string,
  outcome: { succeeded: boolean; message: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("job_sources")
    .update(
      outcome.succeeded
        ? { last_synced_at: new Date().toISOString(), last_error: outcome.message }
        : { last_error: outcome.message },
    )
    .eq("id", sourceId)
    .eq("user_id", userId);
  assertMutation("record sync result", error);
}
