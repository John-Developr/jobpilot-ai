# Security overview

## Implemented

| Control | Where |
| --- | --- |
| Supabase Auth, email/password; public sign-up disabled | `supabase/config.toml`, hosted project setting |
| JWT verification on every request path (`getClaims`) | `src/lib/supabase/proxy.ts`, `src/server/auth.ts` |
| RLS on all tables, owner-only policies | `supabase/migrations/*_initial_schema.sql` |
| Composite FKs prevent cross-user references | same |
| Column grants protect submission verification, locks, idempotency, mirrored email | same |
| Append-only audit log for users | `application_events` policies |
| anon role has no table access | `revoke all … from anon` |
| Private storage buckets, owner-folder policies | `*_storage.sql` |
| Open-redirect protection on `next` param | `features/auth/schemas.ts` (`safeRedirectPath`) |
| Generic sign-in error (no account enumeration) | `signInAction` |
| Security headers: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` | `next.config.ts` |
| `server-only` guards on server modules; publishable key only in the browser | `src/lib/supabase/server.ts`, `src/server/*` |
| Search engines disallowed (`robots: noindex`) | root layout metadata |
| Portfolio read access via least-privilege role (`jobpilot_reader`: column SELECT on 5 tables, read-only sessions, 10 s statement timeout); URL is server-only | portfolio migration `20261121000100_jobpilot_reader.sql`, `src/lib/integrations/portfolio/reader.ts` |

## Planned

- Content Security Policy with nonces (Phase 9).
- Secret-key Supabase client confined to worker code (Phase 6).
- Supabase Vault for automation credentials (Phase 7).
- MFA (TOTP) for the owner account (Phase 9).
- Dependency audit in CI (`pnpm audit`) (Phase 9).

## API key management

| Key | Exposure | Storage |
| --- | --- | --- |
| Supabase publishable key | Browser (safe; RLS enforces access) | Vercel env |
| Supabase secret key | Workers only | Trigger.dev env (never Vercel client bundles) |
| OpenAI, Trigger.dev, Sentry, email provider | Server/workers only | Vercel / Trigger.dev env |
| `PORTFOLIO_DATABASE_URL` (read-only role password) | Server only | `.env.local` / Vercel env; revoke with `alter role jobpilot_reader nologin` |

Rotate immediately if a key appears in logs, commits or screenshots. `.env*` files are git-ignored.

See [access-control.md](access-control.md) and [data-privacy.md](data-privacy.md).
