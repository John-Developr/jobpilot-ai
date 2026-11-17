import "server-only";
import { ConnectorError } from "./types";

/** Generic client identity; no personal details are sent to job sources. */
export const USER_AGENT = "JobPilotAI/0.1 (personal job search assistant)";
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * GET JSON from a fixed, known API host. Returns null on 404 so callers can
 * report "board not found" per company instead of failing the whole sync.
 */
export async function getJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new ConnectorError(timedOut ? "The source did not respond in time." : "Could not reach the source.");
  }
  if (response.status === 404) return null;
  if (response.status === 429) throw new ConnectorError("The source is rate limiting requests. Try again later.");
  if (!response.ok) throw new ConnectorError(`The source returned HTTP ${response.status}.`);

  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new ConnectorError("The source response is too large.");
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new ConnectorError("The source response is too large.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ConnectorError("The source returned invalid data.");
  }
}
