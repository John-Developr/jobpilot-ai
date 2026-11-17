import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { USER_AGENT } from "./job-sources/http";

/**
 * Fetches a user-supplied public web page with SSRF protection:
 * https only, no IP literals or internal hostnames, every resolved address must be
 * public, redirects re-validated hop by hop, response size and time capped.
 * Residual risk: DNS rebinding between check and connect (acceptable for a single-user app).
 */

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

export class SafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeFetchError";
  }
}

function isPrivateIPv4(address: string): boolean {
  const [a = 0, b = 0] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) {
    const v6 = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
    if (mapped?.[1]) return isPrivateIPv4(mapped[1]);
    return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff");
  }
  return true;
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError("Enter a valid URL.");
  }
  if (url.protocol !== "https:") throw new SafeFetchError("Only https:// pages can be fetched.");
  if (url.username || url.password) throw new SafeFetchError("URLs with credentials are not allowed.");
  const host = url.hostname.toLowerCase();
  if (isIP(host.replace(/^\[|\]$/g, "")) || host === "localhost" || /\.(local|localhost|internal|lan|home)$/.test(host)) {
    throw new SafeFetchError("That address is not a public website.");
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new SafeFetchError("That website could not be found.");
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new SafeFetchError("That address is not a public website.");
  }
  return url;
}

export async function fetchPublicHtml(raw: string): Promise<{ url: string; html: string }> {
  let current = await assertPublicUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      throw new SafeFetchError("The page could not be loaded.");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new SafeFetchError("The page redirected without a destination.");
      current = await assertPublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new SafeFetchError(`The page returned HTTP ${response.status}.`);
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("html")) throw new SafeFetchError("That URL is not a web page.");

    const reader = response.body?.getReader();
    if (!reader) throw new SafeFetchError("The page was empty.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        break; // Structured data sits in <head>; a truncated page is still useful.
      }
      chunks.push(value);
    }
    return { url: current.toString(), html: new TextDecoder().decode(Buffer.concat(chunks)) };
  }
  throw new SafeFetchError("Too many redirects.");
}
