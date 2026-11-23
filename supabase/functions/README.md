# Edge functions

Supabase requires every function to sit directly in this folder (no nesting), so
the 100+ functions are indexed by domain here instead. Each function's entry
point is `<name>/index.ts`; JWT verification is set per function in
`supabase/config.toml`. Never pass `--no-verify-jwt` when batch deploying.

Shared logic lives in `_shared/`, grouped by the same domains:

| `_shared/` folder | What lives there |
| --- | --- |
| `core/` | Auth, HTTP helpers, Supabase client, rate limits, error mapping, URL safety, text sanitising |
| `ai/` | Model calls (`ai.ts`), image generation, OpenAI spend tracking |
| `billing/` | Stripe, billing gate and periods, tier policy and tier recommendation |
| `outreach/` | Prospecting, campaigns, drip schedule, send window, replies, lead import, auto-approve |
| `social/` | Content and caption gates, social strategy and budget, image prompts, channel plan, Post for Me helpers, topic ledger |
| `seo/` | Audit rubric and checks, crawl health, scan scoring, AI readiness, schema markup, `crawler/` engine |
| `wordpress/` | Plugin version, WordPress site helpers and fix application, first-party traffic ingest |
| `client/` | Client context, cycles, onboarding, alerts, outcomes, `profile/` company-profile agent |
| `steward/` | Goal-driven per-client steward agents (gate, loop, proposals, run, SEO actions) and their tools |

## Index

**Auth and access**
`accept-invitation`, `get-invitation`, `signup`, `admin`

**Gap analysis and reports**
`analyze-website`, `generate-analysis`, `send-gap-report`, `send-resume-link`, `submit-followup`,
`get-prospect-report`, `send-system-pdf`, `send-report-to-client`, `generate-before-after`

**SEO, crawling and WordPress**
`seo-audit`, `seo-reaudit-scan`, `site-crawl`, `process-site-crawl`, `run-ai-visibility-probes`,
`run-qa-scan`, `apply-qa-fix`, `generate-fix-plan`, `apply-fix-to-wordpress`, `approve-wp-fix`,
`scan-wordpress-site`, `connect-site`, `disconnect-site`, `prepare-connection`, `track-pageview`,
`get-live-analytics`, `build-company-profile`, `extract-brand-assets`, `generate-brand-guidelines`

**Prospecting and outreach**
`auto-discover-prospects`, `discover-prospects`, `discover-prospects-web`, `backfill-prospect-context`,
`prospect-campaign`, `prospect-icp`, `run-prospect-drip`, `send-prospect-report`, `process-email-queue`,
`queue-sequence-emails`, `detect-inactive-leads`, `resend-webhook`, `track-click`, `track-open`,
`unsubscribe`, `generate-lead-insights`, `generate-personalized-content`, `generate-email-template`,
`generate-review-response`, `send-test-email`,
`test-client-smtp`

**Social and content**
`generate-social-content`, `generate-social-image`, `generate-social-images-batch`, `check-image-batches`,
`sync-fill-missing-images`, `fill-scheduled-content`, `auto-schedule-content`, `publish-scheduled-content`,
`regenerate-social-strategy`, `save-channel-plan`, `reconcile-postforme-posts`, `postforme-connect-account`,
`postforme-disconnect-account`, `postforme-publish-post`, `postforme-set-primary-account`,
`postforme-sync-accounts`, `postforme-webhook`, `generate-case-study`,
`generate-approval-draft`, `handle-approval`, `send-approval-reminders`, `run-ai-batch`

**Client lifecycle and workflow**
`advance-workflow`, `auto-run-client-tasks`, `check-stalled-workflows`, `seed-tier-workflow`,
`start-client-cycle`, `client-context-refresh`, `sync-intake-context`,
`parse-sop`, `send-client-invite`, `send-client-notification`, `send-booking-confirmation`,
`send-weekly-recap`, `run-automation`, `process-agent-jobs`, `check-alerts`, `steward-proposals`,
`steward-run`

**Billing**
`billing-enforce`, `stripe-billing-portal`, `stripe-create-checkout`, `stripe-webhook`

**Admin and ops**
`admin-ai-spend`, `chat`, `test-api-key`
