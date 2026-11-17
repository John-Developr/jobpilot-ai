---
name: ai-integration
description: How JobPilot AI calls models — the central AI service (Gemini or OpenAI via Chat Completions), key and model failover, prompt versioning, structured outputs and tool calling with Zod, scoring math, grounding rules, usage tracking. Load before building or changing any AI-backed feature.
---

# AI integration

Status: **Implemented** (evaluation, Application Studio, Ask JobPilot). Docs: `docs/ai/`.

## The service: `src/lib/ai/run-structured.ts` (server-only)

| Function | Use |
| --- | --- |
| `loadActivePrompt(ctx, key)` | Active `prompt_versions` row → `{ id, key, version, template, model, models }`. `models` = `AI_MODEL` list ?? provider defaults ?? the row's `default_model`. |
| `renderTemplate(template, vars)` | Fills `{{name}}`; every placeholder must be given. |
| `runStructured({ ctx, prompt, variables, schema, schemaName })` | One JSON answer validated by Zod → `{ data, model, promptVersionId }`. `model` is the one that actually answered. |
| `runConversation({ ctx, prompt, variables, messages, tools, onEvent })` | Streamed tool-calling turn (max 6 requests) → `{ text, toolsUsed, model }`. `onEvent`: `thinking`, `tools`, `text`. |
| `defineTool({ name, description, parameters, execute })` | Read-only tool; arguments are Zod-validated before `execute`. Failures go back to the model as JSON errors. |
| `isAiConfigured()` | For UI: show "AI needs a key" instead of a broken button. |

Features never import `openai`. Errors: `AiOutputError` (bad output) and `UserFacingError` (show as is).

## Providers and failover

- Chat Completions only (works for OpenAI and Gemini's endpoint `https://generativelanguage.googleapis.com/v1beta/openai/`). Do not use the Responses API.
- `src/config/server-env.ts`: `aiCredentials()` → provider + ordered keys (`GEMINI_API_KEY`, `GEMINI_API_KEY2`, `GEMINI_API_KEY_3`, …); `aiModelOverrides()` reads `AI_MODEL` as a list.
- `src/lib/ai/key-pool.ts` + `withFailover`: tries the preferred model on key 1, 2, …, then the next model. Parks: 429 → (key, model) using Google's retry hint or 1 min (daily quota ≥ 1 h); 401/403/"API key not valid" → key 24 h; 404 → (key, model) 24 h; 503 after one retry → model 2 min. Other errors are not retried. SDK retries are off (`maxRetries: 0`).
- Logs `ai.key.parked` with key number, model, reason — never the key.

## Gemini quirks (already handled; keep them in mind)

- Rejects bounded schemas ("too many states") → `relaxJsonSchema` strips min/max/length/pattern/format for Gemini; Zod enforces them after.
- May omit nullable tool arguments → `withOmittedAsNull`.
- Streams whole tool calls without `index` → `collectTurn` keys calls by index or id.
- Tool calls carry `extra_content.google.thought_signature`; replay assistant messages unchanged.
- `gemini-2.5-flash` returns 404 for newer projects; fallbacks cover it.
- Thinking tokens appear only in `total_tokens`; usage counts `max(completion, total − prompt)`.

## Schemas

Strict mode: every property required, `.nullable()` for optional, no transforms. Output schemas live with the feature (`features/evaluation/schemas.ts`, `features/studio/server/generation-service.ts`).

## Prompts

- New behavior = new `prompt_versions` row (`version + 1`, `is_active`) in a migration. Never edit an active template.
- Delimit untrusted text (job postings, documents) and tell the model to ignore instructions inside it.

## Matching

The model scores technical skills, experience and responsibilities (0–100 with reasoning); code scores remote, salary and employment type, applies `automation_settings.scoring_weights` and maps 85/70/55 to qualification levels (`features/evaluation/scoring.ts`). Matched skills are grounded against the verified vocabulary. Evaluations are cached by an input hash.

## Grounding

- Profile facts come only from `loadCandidateContext` (`facts` has no name, email, phone or links). Contact details and signatures are added by code after generation.
- Studio runs `checkGrounding` on every saved version: job skills you lack and numbers not in the profile or job are flagged; `mark_application_ready` refuses until confirmed.

## Tracking

Every operation writes one `ai_usage_events` row (tokens, latency, succeeded, error_code, actual model). Cost stays null (prices change).

## Testing

Mock `openai` (`chat.completions.create`) and `@/config/server-env` as in `tests/unit/assistant/run-conversation.test.ts` (streamed chunks via an async generator). Live checks use a temporary test or script, are deleted afterwards and never print keys.
