import type { DbEnum } from "@/types/database";

/**
 * Supported job sources (client-safe metadata only; fetch logic lives in registry.ts).
 * A source missing here is unsupported — see docs/architecture/integration-architecture.md.
 */
export const JOB_SOURCE_CATALOG = {
  remoteok: {
    name: "Remote OK",
    kind: "api",
    configKind: "keywords",
    description: "Remote jobs from remoteok.com's public API, filtered by your keywords.",
    attribution: "Listings link back to Remote OK, as its API terms require.",
  },
  greenhouse: {
    name: "Greenhouse company boards",
    kind: "career_page",
    configKind: "companies",
    description: "Career boards of companies that hire through Greenhouse.",
    boardHint: "The name after boards.greenhouse.io/ or job-boards.greenhouse.io/, e.g. gitlab",
  },
  lever: {
    name: "Lever company boards",
    kind: "career_page",
    configKind: "companies",
    description: "Career boards of companies that hire through Lever.",
    boardHint: "The name after jobs.lever.co/, e.g. palantir",
  },
  ashby: {
    name: "Ashby company boards",
    kind: "career_page",
    configKind: "companies",
    description: "Career boards of companies that hire through Ashby.",
    boardHint: "The name after jobs.ashbyhq.com/, e.g. ashby",
  },
  manual: {
    name: "Manual import",
    kind: "manual",
    configKind: "none",
    description: "Jobs you add yourself — the supported way to track LinkedIn, Indeed and JobStreet listings.",
  },
} as const satisfies Record<
  string,
  {
    name: string;
    kind: DbEnum<"source_kind">;
    configKind: "keywords" | "companies" | "none";
    description: string;
    attribution?: string;
    boardHint?: string;
  }
>;

export type ConnectorKey = keyof typeof JOB_SOURCE_CATALOG;
export type AutomatedConnectorKey = Exclude<ConnectorKey, "manual">;

export const AUTOMATED_CONNECTOR_KEYS = ["remoteok", "greenhouse", "lever", "ashby"] as const satisfies readonly AutomatedConnectorKey[];

export function isConnectorKey(value: string | null | undefined): value is ConnectorKey {
  return typeof value === "string" && Object.hasOwn(JOB_SOURCE_CATALOG, value);
}

/** Minimum time between syncs of one source, to respect the providers. */
export const SYNC_COOLDOWN_MINUTES = 10;

/** Upper bound on jobs stored per sync (most recent first). */
export const MAX_JOBS_PER_SYNC = 500;
