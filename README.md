# Orange Door Marketing

Marketing site, client portal and admin panel for Orange Door Marketing, plus the
agentic back end that runs SEO, prospecting, social and reporting for each client.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 18, Vite, TypeScript, Tailwind, shadcn/ui |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions on Deno, pg_cron) |
| Hosting | Vercel (static app plus `api/` functions for PDF and brand rendering) |
| AI | OpenAI (primary) with Groq gpt-oss fallback, via `supabase/functions/_shared/ai/ai.ts` |
| Email | Resend (webhook for replies), optional per-client SMTP |
| Social publishing | Post for Me, plus direct Facebook, LinkedIn and X OAuth |
| Billing | Stripe |
| WordPress | `wp-plugin/orangedoor.php`, connects client sites for scans, fixes and first-party traffic |

## Repository layout

```
src/
  apps/          Three entry apps: MarketingApp, ClientApp (portal), AdminApp
  pages/         Route-level pages, grouped by app: marketing/, portal/, admin/
  components/    UI (admin/, client-portal/, ui/ for shadcn)
  lib/           Shared helpers and API wrappers
  integrations/  Generated Supabase client and types
api/             Vercel functions (report PDF render, brand asset render)
supabase/
  functions/     Edge functions (index in functions/README.md); _shared/ holds common logic
                 grouped by domain (billing, outreach, social, seo, ...)
  migrations/    SQL migrations, applied in filename order
scripts/         Build and smoke-test scripts
wp-plugin/       WordPress plugin source
public/          Static assets; public/downloads/ is the built plugin zip served to users
```

`public/downloads/orange-door.php` and the zip must match `wp-plugin/orangedoor.php`.
Nothing checks that they match automatically, so after changing the plugin, recopy it and
rebuild the zip.

## Local development

Requirements: Node 20+, npm, and the Supabase CLI. Deno 2 is needed to type check edge functions.

```sh
npm ci
cp .env.example .env     # fill in the Supabase URL and publishable key
npm run dev
```

Scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type check |
| `npm run check:email-links` | Verifies links used in email templates |
| `npm run smoke:quick-analysis` | Smoke test for the quick analysis flow |

Edge function type check (same as CI):

```sh
cd supabase/functions
deno check $(find _shared -name "*.ts" | sort)
```

## Configuration

Frontend variables live in `.env` (see `.env.example`). Never put server secrets there.

Edge function secrets are set with the Supabase CLI:

```sh
supabase secrets set OPENAI_API_KEY=... RESEND_API_KEY=...
```

Main secrets: `OPENAI_API_KEY`, `GROQ_API_KEY`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`,
`ADMIN_PASSWORD`, `POSTFORME_API_KEY`, `PFM_WEBHOOK_SECRET`, `APOLLO_API_KEY`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FACEBOOK_APP_ID/SECRET`,
`LINKEDIN_CLIENT_ID/SECRET`, `TWITTER_CLIENT_ID/SECRET`, `APP_URL`,
`CLIENT_PORTAL_URL`, `BRAND_RENDER_SECRET`. Search `Deno.env.get(` under
`supabase/functions` for the full list. `SUPABASE_SERVICE_ROLE_KEY` only ever exists
in the edge function environment.

`BRAND_RENDER_SECRET` must also be set as a Vercel env var with the same value.

## Deploying

- **Frontend and `api/`:** pushed to `main` deploys on Vercel. `vercel-build` bundles the report renderer first.
- **Migrations:** `supabase db push`, or apply through the Supabase MCP or dashboard.
- **Edge functions:** `supabase functions deploy <name> ...`. Do not pass `--no-verify-jwt`;
  `supabase/config.toml` sets JWT verification per function. A change to anything under
  `_shared/` needs every function that imports it to be redeployed.

## Conventions

- All AI calls go through `_shared/ai/ai.ts` (`callAI`, `callAIJson`, `callAIWithTools`). It handles
  retries, model fallback, run logging and strips em and en dashes from every output.
- Tier limits and feature gating live in `_shared/billing/tierPolicy.ts`.
- Client-facing copy must not invent claims; use `NO_FABRICATION_GUARDRAIL` for prompts built from client data.
- CI (`.github/workflows/ci.yml`) runs tsc, eslint, build and deno check.
