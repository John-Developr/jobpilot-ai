import "server-only";
import type { z } from "zod";
import type { AutomatedConnectorKey } from "./catalog";
import { parseAshby, parseGreenhouse, parseLever, parseRemoteOk, type ParseResult } from "./connectors";
import { getJson } from "./http";
import {
  companyBoardConfigSchema,
  ConnectorError,
  keywordFeedConfigSchema,
  type CompanyBoardConfig,
  type FetchResult,
  type KeywordFeedConfig,
} from "./types";

interface Connector<C> {
  configSchema: z.ZodType<C>;
  fetchJobs(config: C): Promise<FetchResult>;
}

/** Fetches each company board in turn; one bad board becomes a warning, not a failed sync. */
function companyBoards(
  sourceName: string,
  urlFor: (token: string) => string,
  parse: (payload: unknown, token: string) => ParseResult,
): Connector<CompanyBoardConfig> {
  return {
    configSchema: companyBoardConfigSchema,
    async fetchJobs({ companies }) {
      const jobs: FetchResult["jobs"] = [];
      const warnings: string[] = [];
      for (const token of companies) {
        try {
          const payload = await getJson(urlFor(token));
          if (payload === null) {
            warnings.push(`"${token}" was not found on ${sourceName}.`);
            continue;
          }
          const result = parse(payload, token);
          jobs.push(...result.jobs);
          if (result.skipped > 0) warnings.push(`${token}: skipped ${result.skipped} malformed listing(s).`);
        } catch (error) {
          if (!(error instanceof ConnectorError)) throw error;
          warnings.push(`${token}: ${error.message}`);
        }
      }
      if (jobs.length === 0 && warnings.length === companies.length) {
        throw new ConnectorError(warnings.join(" "));
      }
      return { jobs, warnings };
    },
  };
}

const remoteOk: Connector<KeywordFeedConfig> = {
  configSchema: keywordFeedConfigSchema,
  async fetchJobs() {
    const payload = await getJson("https://remoteok.com/api");
    if (payload === null) throw new ConnectorError("Remote OK API is unavailable.");
    const result = parseRemoteOk(payload);
    return {
      jobs: result.jobs,
      warnings: result.skipped > 0 ? [`Skipped ${result.skipped} malformed listing(s).`] : [],
    };
  },
};

const enc = encodeURIComponent;

const greenhouse = companyBoards(
  "Greenhouse",
  (token) => `https://boards-api.greenhouse.io/v1/boards/${enc(token)}/jobs?content=true`,
  parseGreenhouse,
);
const lever = companyBoards("Lever", (token) => `https://api.lever.co/v0/postings/${enc(token)}?mode=json`, parseLever);
const ashby = companyBoards(
  "Ashby",
  (token) => `https://api.ashbyhq.com/posting-api/job-board/${enc(token)}?includeCompensation=true`,
  parseAshby,
);

async function run<C extends { keywords: string[] }>(
  connector: Connector<C>,
  rawConfig: unknown,
): Promise<FetchResult & { keywords: string[] }> {
  const parsed = connector.configSchema.safeParse(rawConfig);
  if (!parsed.success) throw new ConnectorError("This source is not configured yet. Open its settings first.");
  const result = await connector.fetchJobs(parsed.data);
  return { ...result, keywords: parsed.data.keywords };
}

/** Runs a connector with its stored config, validated against that connector's own schema. */
export function runConnector(key: AutomatedConnectorKey, rawConfig: unknown) {
  switch (key) {
    case "remoteok":
      return run(remoteOk, rawConfig);
    case "greenhouse":
      return run(greenhouse, rawConfig);
    case "lever":
      return run(lever, rawConfig);
    case "ashby":
      return run(ashby, rawConfig);
  }
}
