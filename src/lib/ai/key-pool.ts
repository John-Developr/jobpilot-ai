/**
 * Failover across API keys and models. A request uses the first usable (model, key) pair,
 * models in preference order and, for each model, keys in order (key 1, key 2, …).
 * Free-tier quotas are per model per project, so limits park one pair; a rejected key
 * parks that key for every model; an overloaded model parks that model for every key.
 *
 * State lives in server memory: it resets on restart and is per server instance, which is
 * fine for a single-user app (a parked pair is simply tried again after a restart).
 */

export type Failure =
  /** 429: rate limit or quota. `retryAfterMs` from the provider when given. */
  | { kind: "limit"; retryAfterMs: number | null; daily: boolean }
  /** 401/403 or "API key not valid": revoked, expired or wrong key. */
  | { kind: "rejected" }
  /** 404: this model is not available to this key (e.g. retired for new projects). */
  | { kind: "model_unavailable" }
  /** 503 that persisted after a retry: the model is overloaded for everyone. */
  | { kind: "overloaded" };

export interface Candidate {
  keyIndex: number;
  model: string;
}

const MINUTE = 60_000;
const COOLDOWN = {
  limit: MINUTE,
  dailyLimit: 60 * MINUTE,
  rejected: 24 * 60 * MINUTE,
  modelUnavailable: 24 * 60 * MINUTE,
  overloaded: 2 * MINUTE,
};

export class KeyPool {
  private readonly keyUntil = new Map<number, number>();
  private readonly modelUntil = new Map<string, number>();
  private readonly pairUntil = new Map<string, number>();

  constructor(readonly keys: readonly string[]) {}

  private usableAt({ keyIndex, model }: Candidate): number {
    return Math.max(this.keyUntil.get(keyIndex) ?? 0, this.modelUntil.get(model) ?? 0, this.pairUntil.get(pairId(keyIndex, model)) ?? 0);
  }

  /** First usable pair at `now`, skipping pairs already tried for this request; null when none. */
  next(now: number, models: readonly string[], tried: ReadonlySet<string> = new Set()): Candidate | null {
    for (const model of models) {
      for (let keyIndex = 0; keyIndex < this.keys.length; keyIndex += 1) {
        const candidate = { keyIndex, model };
        if (!tried.has(pairId(keyIndex, model)) && this.usableAt(candidate) <= now) return candidate;
      }
    }
    return null;
  }

  /** Parks what the failure is about and returns when it becomes usable again. */
  park({ keyIndex, model }: Candidate, failure: Failure, now: number): number {
    switch (failure.kind) {
      case "rejected":
        return setUntil(this.keyUntil, keyIndex, now + COOLDOWN.rejected);
      case "overloaded":
        return setUntil(this.modelUntil, model, now + COOLDOWN.overloaded);
      case "model_unavailable":
        return setUntil(this.pairUntil, pairId(keyIndex, model), now + COOLDOWN.modelUnavailable);
      case "limit": {
        const duration = failure.daily
          ? // A daily quota will not recover in the few seconds a retry hint may suggest.
            Math.max(failure.retryAfterMs ?? 0, COOLDOWN.dailyLimit)
          : (failure.retryAfterMs ?? COOLDOWN.limit);
        return setUntil(this.pairUntil, pairId(keyIndex, model), now + Math.max(duration, 1_000));
      }
    }
  }

  /** Earliest time any of `models` becomes usable on some key, or null when nothing is parked. */
  nextAvailableAt(models: readonly string[]): number | null {
    const times = models.flatMap((model) => this.keys.map((_key, keyIndex) => this.usableAt({ keyIndex, model })));
    return times.length > 0 ? Math.min(...times) : null;
  }
}

export const pairId = (keyIndex: number, model: string) => `${keyIndex}|${model}`;

function setUntil<K>(map: Map<K, number>, key: K, until: number): number {
  map.set(key, Math.max(map.get(key) ?? 0, until));
  return map.get(key) ?? until;
}

/** Reads "37s" / "1.5s" (Google RetryInfo.retryDelay) as milliseconds. */
export function parseRetryDelay(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value.trim());
  return match?.[1] ? Math.ceil(Number(match[1]) * 1000) : null;
}

/**
 * Classifies a provider error as something failover can route around, or null when it is
 * not (bad request, server error, network) and trying another key or model would not help.
 * 503 is reported as "overloaded" only by the caller, after its own retry.
 */
export function classifyFailure(status: number | undefined, message: string, body: unknown): Failure | null {
  if (status === 401 || status === 403 || (status === 400 && /api key/i.test(message))) return { kind: "rejected" };
  if (status === 404) return { kind: "model_unavailable" };
  if (status === 503) return { kind: "overloaded" };
  if (status !== 429) return null;
  const text = `${message} ${safeStringify(body)}`;
  const retryDelay = /"retryDelay"\s*:\s*"([\d.]+s)"/.exec(text)?.[1];
  return { kind: "limit", retryAfterMs: parseRetryDelay(retryDelay), daily: /per\s?day|PerDay|daily/i.test(text) };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}
