-- One row per brand-extraction attempt. Single source of truth for "is the
-- extractor running / did it work / why not", so the portal, admin and the
-- stall sweeper all agree instead of inferring state from workflow_steps
-- (which is marked completed even when extraction found nothing).
CREATE TABLE IF NOT EXISTS public.brand_extraction_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  website_url text NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'empty', 'failed')),
  trigger text NOT NULL DEFAULT 'onboarding',   -- onboarding | client | admin
  strategy text,                                -- default | fallback
  assets_found integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_extraction_runs_client_idx
  ON public.brand_extraction_runs (client_account_id, started_at DESC);

-- At most one active run per client (guards double-clicks, retries and the
-- automation queue re-delivering a job).
CREATE UNIQUE INDEX IF NOT EXISTS brand_extraction_runs_one_active
  ON public.brand_extraction_runs (client_account_id) WHERE status = 'running';

ALTER TABLE public.brand_extraction_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins select brand extraction runs"
ON public.brand_extraction_runs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients select own brand extraction runs"
ON public.brand_extraction_runs FOR SELECT
USING (
  client_account_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
);
-- Writes happen only from edge functions with the service role (bypasses RLS).
