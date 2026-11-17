# Deployment guide

## 1. Supabase

1. Create a project (region close to Manila, e.g. Singapore `ap-southeast-1`).
2. Authentication → Providers → Email: enabled. Authentication → Sign In / Up: **disable new sign-ups**.
3. Link and push migrations (review the dry run first):
   ```bash
   pnpm dlx supabase@3.2.0 login
   pnpm dlx supabase@3.2.0 link --project-ref <ref>
   pnpm dlx supabase@3.2.0 db push --dry-run
   pnpm dlx supabase@3.2.0 db push
   pnpm db:types
   ```
4. Authentication → Users → Add user (your email + strong password). The new-user trigger creates your profile and settings.
5. Authentication → URL configuration: Site URL = production URL; add `http://localhost:3000` for development.

## 2. Local development

```bash
cp .env.example .env.local   # fill Supabase URL + publishable key
pnpm install
pnpm dev                     # http://localhost:3000
```

## 3. Vercel

1. Import the GitHub repository. Framework: Next.js. Install command `pnpm install`.
2. Environment variables (Production + Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Deploy. Add the deployment URL to Supabase Auth URL configuration.

## 4. Trigger.dev, OpenAI, Sentry

Planned for Phases 4, 6 and 8; each phase extends this guide and `environment-variables.md`.

## Release checklist

- CI green on `main`.
- Migrations pushed **before** deploying code that depends on them (expand first).
- Backup confirmed before any migration on production (see backup-recovery.md).
- Smoke test: sign in, open Settings, save, toggle pause on/off, sign out.
