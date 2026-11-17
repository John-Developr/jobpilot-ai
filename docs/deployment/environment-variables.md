# Environment variables

Template: `.env.example`. Local values go in `.env.local` (git-ignored).
Public values are parsed and validated in `src/config/env.ts`; the app fails fast with a clear message if they are missing.

| Variable | Required | Scope | Used by | Status |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Browser + server | Supabase clients, proxy | In use |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Browser + server | Supabase clients, proxy | In use |
| `PORTFOLIO_DATABASE_URL` | Optional | Server only | Portfolio sync (read-only `jobpilot_reader` login, Supabase pooler URL) | In use when set |
| `SUPABASE_SECRET_KEY` | Phase 6 | Workers only | Background tasks, submission service | Planned |
| `AI_PROVIDER` | Optional | Server only | `gemini` or `openai`; unset = gemini when `GEMINI_API_KEY` is set, else openai | In use |
| `GEMINI_API_KEY` | For AI features on Gemini | Server only | `src/config/server-env.ts` → `src/lib/ai/run-structured.ts` | In use |
| `GEMINI_API_KEY2`, `GEMINI_API_KEY_3`, … | Optional | Server only | Fallback keys, used in numeric order when earlier keys hit a limit or are rejected (`src/lib/ai/key-pool.ts`) | In use when set |
| `OPENAI_API_KEY` | For AI features on OpenAI | Server only | Same | In use when the provider is openai |
| `AI_MODEL` | Optional | Server only | Comma-separated models for every prompt, in fallback order (default on Gemini `gemini-2.5-flash,gemini-3-flash-preview,gemini-3.5-flash-lite`; on OpenAI each prompt's `default_model`) | In use when set |
| `TRIGGER_SECRET_KEY` | Phase 6 | Server/workers | Trigger.dev SDK | Planned |
| `SENTRY_DSN` | Phase 8 | Server + browser | Error reporting | Planned |

### Setting up PORTFOLIO_DATABASE_URL

1. Apply `supabase/migrations/20261121000100_jobpilot_reader.sql` from the portfolio repo in the portfolio project's SQL editor.
2. In the same SQL editor: `alter role jobpilot_reader with login password '<long random password>';` (generate it; never commit it).
3. Portfolio project → Connect → Transaction pooler. Copy the URI and replace the user with `jobpilot_reader.<project-ref>` and the password with yours.
4. Put it in `.env.local` (and Vercel env) as `PORTFOLIO_DATABASE_URL`, restart the dev server.
5. Revoke any time with `alter role jobpilot_reader nologin;`.

Rules: never prefix a secret with `NEXT_PUBLIC_`; never read secrets in Client Components; add new variables to
`.env.example`, this table and the relevant `src/config` parser in the same change.
