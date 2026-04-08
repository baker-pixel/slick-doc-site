-- Fix automation_alerts: drop wildcard, add restricted policies
DROP POLICY IF EXISTS "Admin full access to automation_alerts" ON public.automation_alerts;

CREATE POLICY "Authenticated users can read automation_alerts"
  ON public.automation_alerts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage automation_alerts"
  ON public.automation_alerts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Fix pipeline_stages: drop wildcard, add restricted policies
DROP POLICY IF EXISTS "Admin full access to pipeline_stages" ON public.pipeline_stages;

CREATE POLICY "Authenticated users can read pipeline_stages"
  ON public.pipeline_stages
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage pipeline_stages"
  ON public.pipeline_stages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);