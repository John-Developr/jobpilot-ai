# Contributing

This is a personal project, but it is maintained to team standards. Rules for code, database,
design and safety are in [AGENTS.md](AGENTS.md); this file covers process.

## Workflow

1. Branch from `main`: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `chore/<topic>`.
2. Implement one vertical slice (migration → server → UI → tests → docs).
3. Run `pnpm check && pnpm build` locally.
4. Update `docs/changelog.md` (Unreleased) and the roadmap status.
5. Open a PR. CI must pass. Describe what was verified and what was not.

## Commits

Conventional Commits: `feat(jobs): add Remote OK connector`, `fix(scheduling): treat window end as exclusive`.
Keep commits focused; never commit `.env*` files (except `.env.example`) or generated secrets.

## Database changes

Never edit an applied migration or change the hosted schema by hand. Add a new migration and a
migration test; see [docs/database/migrations.md](docs/database/migrations.md).

## Architecture changes

Significant decisions get an ADR in `docs/architecture/architecture-decisions/`
(Context, Decision, Alternatives, Consequences, Status).
