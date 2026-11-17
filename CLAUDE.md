# CLAUDE.md

Primary entry point for Claude Code. Repository-wide rules live in `AGENTS.md` and apply in full:

@AGENTS.md

## Claude Code workflow

- Start each task by reading the roadmap section for the phase you are in: `docs/development-roadmap.md`.
- Work in small increments: one vertical slice (migration → repository → action → UI → tests → docs) at a time.
- Use the project slash commands in `.claude/commands/`: `/implement-feature`, `/create-migration`, `/review`, `/run-tests`, `/update-docs`.
- Skills in `.claude/skills/` hold detailed how-tos (frontend, backend, database, AI, testing). Load the relevant one before working in that area.

## Specialist agents (`.claude/agents/`)

Delegate only when a task is large enough to benefit; the primary agent stays responsible for
integration and final verification. Agents must not edit the same files concurrently.

| Agent | Use for |
| --- | --- |
| `architect` | Reviewing plans, module boundaries, ADRs |
| `frontend-engineer` | UI, design system, accessibility |
| `backend-engineer` | Server actions, services, repositories, authorization |
| `database-engineer` | Migrations, RLS, indexes, migration tests |
| `ai-engineer` | Prompts, structured outputs, matching engine, AI usage tracking |
| `qa-engineer` | Test plans, unit/integration/e2e tests, edge cases |
| `documentation-engineer` | Docs, changelog, ADR upkeep |

## Verification before reporting done

Run `pnpm check && pnpm build`. If a step cannot run (e.g. no Supabase project for e2e),
say so explicitly in the report.
