
-- Drop wildcard policies
DROP POLICY IF EXISTS "Allow all access to sla_configurations" ON public.sla_configurations;
DROP POLICY IF EXISTS "Allow all access to qa_checkpoints" ON public.qa_checkpoints;
DROP POLICY IF EXISTS "Allow all access to daily_digests" ON public.daily_digests;

-- sla_configurations: admin read/write, service role via SECURITY DEFINER functions
CREATE POLICY "Admins can manage sla_configurations"
  ON public.sla_configurations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access sla_configurations"
  ON public.sla_configurations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- qa_checkpoints: admin read/write, service role full access
CREATE POLICY "Admins can manage qa_checkpoints"
  ON public.qa_checkpoints FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access qa_checkpoints"
  ON public.qa_checkpoints FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- daily_digests: admin read/write, service role full access
CREATE POLICY "Admins can manage daily_digests"
  ON public.daily_digests FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access daily_digests"
  ON public.daily_digests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
