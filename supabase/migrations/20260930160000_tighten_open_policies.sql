-- ai_readiness_scores: "Service role full access" was granted to the PUBLIC role
-- with USING/WITH CHECK true, i.e. anyone with the anon key could read, forge or
-- delete scores. service_role bypasses RLS so it needs no policy. Browser code
-- only ever SELECTs (QuickAnalysis, Report, ReportStep, ClientSeoTab); all writes
-- happen in edge functions.
drop policy if exists "Service role full access on ai_readiness_scores" on public.ai_readiness_scores;
create policy "Public can read ai_readiness_scores"
  on public.ai_readiness_scores for select using (true);

-- admin_settings: "Service role can read settings" was SELECT using (true) for
-- PUBLIC, exposing admin_notification_email etc. to anyone with the anon key.
-- get_anon_key() is SECURITY DEFINER and edge functions use service_role, so
-- nothing needs public read; admins keep the existing "Admins can manage
-- settings" policy (the admin panel's AutomationControlCenter reads through it).
drop policy if exists "Service role can read settings" on public.admin_settings;
