# Prompt management

Status: **Implemented (Phase 4)** for job evaluation (`job.evaluate`); document generation is Phase 5.

## Model

| Column | Meaning |
| --- | --- |
| `prompt_key` | Stable id, e.g. `job.evaluate` |
| `version` | Integer, increments per change |
| `template` | System + instruction text with `{{placeholders}}` for JSON input blocks |
| `output_schema` | JSON schema snapshot of the Zod schema used |
| `default_model` | Model used unless the call overrides it |
| `is_active` | Exactly one active version per key (partial unique index) |

## Lifecycle

1. Edit the prompt in code (`src/lib/ai/prompts/<key>.ts`) alongside its Zod schema.
2. Add a migration that inserts the new version and flips `is_active` in one transaction.
3. Outputs record `prompt_version_id`, so results from different versions can be compared.
4. Never update or delete a version referenced by outputs (`on delete restrict`).

## Writing rules

- User/job text goes inside delimited JSON blocks, never inline in instructions (prompt-injection hygiene).
- Instructions forbid inventing facts and require "unknown" over guesses.
- Keep templates short; move reference data into structured input.
