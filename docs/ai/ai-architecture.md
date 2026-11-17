# AI architecture

Status: **Implemented** — job evaluation (Phase 4) and Application Studio generation (Phase 5).

## Components

```
features (jobs, studio, assistant) ──► src/lib/ai/run-structured.ts ──► OpenAI Responses API
                                │        ▲
                                │        └─ prompt_versions (active template, default model, output schema)
                                ├─ Zod re-validation of output
                                └─ ai_usage_events (tokens, latency, cost, success)
```

- **One entry point** for all model calls; features never import the OpenAI SDK.
- **Server-only**: runs in background tasks for batch work and in Server Actions only for single, user-initiated
  regenerations.
- **Provenance**: every persisted output stores `model` and `prompt_version_id`.

## Workloads

| Workload | Prompt key | Output | Trigger |
| --- | --- | --- | --- |
| Requirement extraction | `job.extract_requirements` | `job_requirements` rows, normalized skills | After ingestion |
| Job evaluation | `job.evaluate` | Per-criterion scores + evidence → `job_scores` | After extraction / profile change |
| Cover letter, email, recruiter message | `studio.<kind>` | Markdown text → `application_documents` | User request |
| Resume summary, skills emphasis | `studio.resume_summary`, `studio.skills_emphasis` | Text / list | User request |
| Ask JobPilot | `assistant.chat` | Text answer after read-only tool calls (`runConversation`) → `assistant_messages` | User question |
| Screening answers | `studio.screening_answer` | Answer + confidence + source facts → `application_answers` | User request / form discovery |

## Tool calling (Ask JobPilot)

`runConversation` streams each model request (`stream: true`, usage included) and reports progress through `onEvent`: `thinking` (a request started), `tools` (tools about to run), `text` (answer deltas). Streamed tool calls are rebuilt by index (OpenAI) or by id (Gemini sends whole calls without an index), keeping provider fields such as Gemini thought signatures. It runs one answer: the model may call tools defined with `defineTool` (Zod schema, strict mode)
for up to 6 requests. Arguments are validated before a tool runs; invalid arguments, unknown tools and tool
failures go back to the model as JSON errors (internal error text is never included). Requests use
`store: false` and carry reasoning forward with `reasoning.encrypted_content`. The tools live in
`src/features/assistant/server/assistant-tools.ts`, are read-only, run as the signed-in user under RLS, and
never return contact details.

## Output validation

1. Structured output constrained by JSON schema derived from Zod.
2. Re-parse with Zod; reject on failure (`AiOutputError`), record a failed usage event, surface "could not generate".
3. Grounding check for generated documents: entities (companies, titles, skills, certifications, numbers) must
   appear in the supplied profile facts; violations block approval until edited.

See [matching-engine.md](matching-engine.md), [prompt-management.md](prompt-management.md), [model-strategy.md](model-strategy.md).
