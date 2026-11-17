---
name: ai-integration
description: How JobPilot AI calls OpenAI — central AI service, prompt versioning, structured outputs with Zod, scoring math, grounding rules for generated documents, usage tracking and cost control. Load before building any AI-backed feature.
---

# AI integration

Status: **Planned (Phase 4).** The service described here does not exist yet; build it to this spec.

## Service shape (`src/lib/ai/`)

- `run-structured.ts` — server-only client (Gemini or OpenAI via Chat Completions) from `AI_PROVIDER` + `GEMINI_API_KEY`/`OPENAI_API_KEY`.
- `run-structured.ts` — `runStructured({ promptKey, input, schema, userId, model? })`:
  1. Load the active `prompt_versions` row for `promptKey`.
  2. Call the Responses API with structured output from the Zod schema.
  3. Re-validate with `schema.safeParse`; on failure throw `AiOutputError`.
  4. Insert `ai_usage_events` (tokens, latency, succeeded, estimated cost).
  5. Return `{ data, model, promptVersionId }`.
- Model choice: `prompt_versions.default_model`, overridable per call; no model names hard-coded in features.

## Prompts

- New behavior = new version row (`prompt_key`, `version + 1`), activated by migration/seed. Never mutate an active template.
- Templates take explicit JSON input blocks; no string-concatenated user text outside a delimited block.

## Matching

- The model returns per-criterion scores (0–100) + evidence; code applies weights from `automation_settings.scoring_weights` and maps to qualification levels (85/70/55 thresholds).
- Persist everything `job_scores` requires. Missing evidence → lower confidence, not invented matches.

## Generation grounding

- Pass only verified profile records (experiences, skills, projects, education) as context.
- System instruction: do not add employers, titles, dates, technologies, certifications or metrics not present in context.
- Post-check: flag any skill/company in the output not found in the profile; block approval until the user resolves it.

## Cost control

Cache by (job id, profile updated_at, prompt version). Truncate/normalize job descriptions. Batch evaluations in background tasks, never in request handlers.
