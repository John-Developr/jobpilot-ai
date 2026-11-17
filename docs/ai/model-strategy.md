# Model strategy

Status: **Implemented.** Provider: **Gemini** (`gemini-2.5-flash`, free tier) by default; OpenAI is supported by setting
`AI_PROVIDER=openai`.

## Provider

All calls use the Chat Completions API, which OpenAI and Gemini's OpenAI-compatible endpoint
(`https://generativelanguage.googleapis.com/v1beta/openai/`) both serve, so switching provider is configuration only.

| Setting | Gemini | OpenAI |
| --- | --- | --- |
| Model | `AI_MODEL` or `gemini-2.5-flash` | `AI_MODEL` or each prompt version's `default_model` |
| Output schema | Sent without bounds (min/max, lengths); Gemini rejects bounded schemas as "too many states". Zod enforces every bound after the call. | Sent as-is (strict) |
| Tool arguments | Gemini may omit nullable arguments; omitted top-level arguments are read as null | Strict |

Verified live on 2026-11-17 with `gemini-2.5-flash`: job evaluation output passed `evaluationOutputSchema`; Ask JobPilot
answered through tool calls. Newer Gemini flash models returned 503 (high demand) that day.

## Key and model failover (`src/lib/ai/key-pool.ts`)

Every request uses the first usable (model, key) pair: the preferred model on key 1, 2, 3 …, then the next model on
each key. Parking rules (server memory; reset on restart):

| Error | Parked | For |
| --- | --- | --- |
| 429 rate/quota | that model on that key (free-tier quotas are per model per project) | Google's retry hint, else 1 min; daily quotas at least 1 h |
| 401/403, "API key not valid" | that key, every model | 24 h |
| 404 (model retired for the key's project) | that model on that key | 24 h |
| 503 after one retry | that model, every key | 2 min |

Other errors (bad request, 500, network after one retry) are not routed around. When nothing is usable the user sees
"All N Gemini API keys are at their limit, busy or were rejected…". `ai.key.parked` logs the key number (never the key),
model and reason. Usage rows and stored evaluations record the model that actually answered.

Verified live 2026-11-17: key 1 out of daily quota for `gemini-2.5-flash` → parked 1 h → key 2 answered. Keys from
newer projects return 404 for `gemini-2.5-flash` and use `gemini-3-flash-preview` instead.

**Terms:** rotating keys from several projects to get past free-tier limits may break Google's API terms (no
circumventing usage limits) and can lead to suspension. Failover for revoked or expired keys is unaffected. A paid tier
on one project is the compliant way to raise limits.

**Free tier caveats:** low requests-per-minute limits (batch scoring and multi-step assistant answers can hit 429; the
app shows "rate limit or free-tier quota reached"), and Google may use free-tier prompts and responses to improve its
products. Use a paid tier or OpenAI if that is not acceptable.

## Tiers

| Tier | Use | Selection |
| --- | --- | --- |
| Fast/cheap | Requirement extraction, classification, short answers | Smallest current model that passes the eval set |
| Quality | Job evaluation explanations, cover letters, screening answers | Mid/large current model |

The concrete model per prompt is `prompt_versions.default_model`; changing it is a new prompt version so results stay traceable.
Pick models when Phase 4 starts using current OpenAI pricing and a small fixture-based eval set (10–20 real job
descriptions with expected scores).

## Token optimization

- Normalize and truncate job descriptions (strip boilerplate, cap length) before sending.
- Send only the profile facts relevant to the workload (skills + experiences for evaluation; selected facts for generation).
- Cache evaluations (see matching-engine.md); regenerate single sections instead of whole documents.
- Batch background evaluations with bounded concurrency; no AI calls during page renders.

## Cost tracking

Every call writes `ai_usage_events` with token counts, latency and outcome. `estimated_cost_usd` is left null: prices change and are not hard-coded.
Phase 8 adds a monthly cost view and an optional monthly budget guard that pauses AI tasks.
