-- Phase F — the outcomes layer. One store for "did it work for the client's
-- business" signals, so the engines stop being purely self-verifying and can
-- start learning from results. Any engine records an outcome here; reporting
-- reads real trends from it; learning loops (e.g. conversions → fit scoring)
-- query it.

CREATE TABLE IF NOT EXISTS public.outcome_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  source text NOT NULL,               -- 'seo' | 'social' | 'prospect' | ...
  metric text NOT NULL,               -- e.g. 'seo_score', 'prospect_converted', 'post_published'
  value numeric NOT NULL,
  period_start date,
  period_end date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outcome_metrics_client_metric
  ON public.outcome_metrics (client_account_id, metric, captured_at DESC);

ALTER TABLE public.outcome_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY outcome_metrics_admin ON public.outcome_metrics
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY outcome_metrics_portal_select ON public.outcome_metrics
  FOR SELECT TO authenticated
  USING (client_account_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  ));
