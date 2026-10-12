-- Security fix (partial): several policies named "Service role full access ..."
-- were granted to {public} with USING (true), which opens the table to every
-- anonymous visitor (the anon key ships in the site's JavaScript). The real
-- service role bypasses RLS, so these policies grant nothing legitimate.
--
-- This migration closes the ones NOTHING in the frontend queries, so there is
-- no behaviour change. Tables the admin panel still reads straight from the
-- browser (email_*, pdf_leads, workflow_steps, client_workflows, client_tasks,
-- client_onboarding, client_postforme_accounts, task_*, ad_campaigns,
-- integration_configs) need the admin panel moved behind the admin edge
-- function first; they are tracked separately.

DROP POLICY IF EXISTS "Admins can manage ad campaign analytics" ON public.ad_campaign_analytics;
DROP POLICY IF EXISTS "Service role full access on ai_visibility_prompts" ON public.ai_visibility_prompts;
DROP POLICY IF EXISTS "Service role full access on ai_visibility_runs" ON public.ai_visibility_runs;
DROP POLICY IF EXISTS "Service role full access client_competitors" ON public.client_competitors;
DROP POLICY IF EXISTS "Service role full access client_integrations" ON public.client_integrations;
DROP POLICY IF EXISTS "Service role full access kpi_dashboards" ON public.kpi_dashboards;
DROP POLICY IF EXISTS "Service role full access reporting_schedules" ON public.reporting_schedules;

-- ai_visibility_scores: the client portal (ClientSeoTab) reads it, so replace
-- the open policy with "a client sees only their own scores".
DROP POLICY IF EXISTS "Service role full access on ai_visibility_scores" ON public.ai_visibility_scores;
CREATE POLICY "Clients can view their own ai_visibility_scores"
  ON public.ai_visibility_scores
  FOR SELECT
  TO authenticated
  USING (client_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  ));
CREATE POLICY "Admins can manage ai_visibility_scores"
  ON public.ai_visibility_scores
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
