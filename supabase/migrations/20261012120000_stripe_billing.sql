-- Stripe billing: subscription state on client_accounts, Stripe invoice sync
-- columns, and a webhook idempotency table. Service gating reads
-- subscription_status / payment_failed_at (see _shared/billingGate.ts).

ALTER TABLE public.client_accounts
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz;

ALTER TABLE public.client_accounts
  ADD CONSTRAINT client_accounts_subscription_status_check
  CHECK (subscription_status IN
    ('none', 'incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'paused'));

-- Real UNIQUE constraints (not partial indexes) so upserts can target them.
ALTER TABLE public.client_accounts
  ADD CONSTRAINT client_accounts_stripe_customer_id_key UNIQUE (stripe_customer_id),
  ADD CONSTRAINT client_accounts_stripe_subscription_id_key UNIQUE (stripe_subscription_id);

ALTER TABLE public.client_invoices
  ADD COLUMN IF NOT EXISTS hosted_invoice_url text,
  ADD COLUMN IF NOT EXISTS invoice_pdf_url text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_payment_attempt timestamptz;

ALTER TABLE public.client_invoices
  ADD CONSTRAINT client_invoices_stripe_invoice_id_key UNIQUE (stripe_invoice_id);

-- Webhook idempotency: Stripe retries deliveries, so each event id is
-- processed once. RLS on with no policies = service-role only.
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- Kill switch for service gating (sandbox/rollout). 'on' enforces.
INSERT INTO public.admin_settings (key, value)
VALUES ('billing_enforcement', 'on')
ON CONFLICT (key) DO NOTHING;

-- Billing drives client_accounts.status (every engine already filters on
-- status='active'): a lapse sets status='paused' + paused_for_billing, and a
-- successful payment resumes only accounts paused for billing, so a manual
-- admin pause is never overridden.
ALTER TABLE public.client_accounts
  ADD COLUMN IF NOT EXISTS paused_for_billing boolean NOT NULL DEFAULT false;
