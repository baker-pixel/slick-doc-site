-- Work cycles: one row per paid billing period per client. A cycle is the unit
-- the three agents plan against -- when an invoice is paid, the previous cycle
-- is closed into a digest (what was approved/rejected, what replied/converted)
-- and the next cycle's social calendar, topics and prospect search are planned
-- from that digest, scheduled from period_start through period_end.
--
-- Idempotency key is (client_account_id, period_end): a repeated webhook, the
-- sweep cron and a manual admin run all converge on the same row.

CREATE TABLE IF NOT EXISTS public.client_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  cycle_no integer NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning', 'active', 'closed', 'failed')),
  trigger_source text NOT NULL DEFAULT 'invoice_paid'
    CHECK (trigger_source IN ('invoice_paid', 'sweep', 'manual')),
  stripe_invoice_id text,
  -- What this cycle was planned with: { steps: {social,prospect,...}, discovery: {focus, queries}, learned: [...] }
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Computed when the cycle closes: { social: {...}, prospect: {...}, learned: [...] }
  digest jsonb,
  error text,
  planned_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_cycles_period_chk CHECK (period_end > period_start),
  CONSTRAINT client_cycles_client_period_key UNIQUE (client_account_id, period_end),
  CONSTRAINT client_cycles_client_no_key UNIQUE (client_account_id, cycle_no)
);

CREATE INDEX IF NOT EXISTS client_cycles_client_status_idx
  ON public.client_cycles (client_account_id, status);

ALTER TABLE public.client_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_cycles_admin ON public.client_cycles
  FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

CREATE POLICY client_cycles_portal_select ON public.client_cycles
  FOR SELECT TO authenticated
  USING (client_account_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = (select auth.uid())
  ));

-- Tag calendar slots with the cycle they were scheduled for.
ALTER TABLE public.content_calendar
  ADD COLUMN IF NOT EXISTS cycle_id uuid REFERENCES public.client_cycles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS content_calendar_cycle_id_idx ON public.content_calendar (cycle_id);

-- Kill switch, same shape as billing_enforcement: 'off' stops automatic
-- rollover (webhook + sweep); manual admin runs still work.
INSERT INTO public.admin_settings (key, value)
VALUES ('cycle_rollover', 'on')
ON CONFLICT (key) DO NOTHING;
