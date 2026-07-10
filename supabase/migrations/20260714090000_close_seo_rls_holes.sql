-- SEO/WordPress teardown: close the public RLS holes left by the old
-- "Service role full access ... USING (true)" policies that were scoped to
-- ALL roles (polroles = {-}) instead of just service_role. The service role
-- bypasses RLS anyway, so these policies granted nothing to legit callers
-- and everything to the anon key. client_credentials leaked live WordPress
-- app-passwords + plugin API keys; the rest leaked client SEO data.
--
-- Portal-shared tables (seo_audits, connected_sites, wp_fix_queue,
-- scan_results) keep their admin + portal-user policies untouched; only the
-- over-broad true-for-everyone policies are removed here.

DROP POLICY IF EXISTS "Service role full access client_credentials" ON public.client_credentials;
DROP POLICY IF EXISTS "Service role full access seo_audits" ON public.seo_audits;
DROP POLICY IF EXISTS "Service role full access keyword_gap_results" ON public.keyword_gap_results;
DROP POLICY IF EXISTS "Service role full access page_speed_results" ON public.page_speed_results;
DROP POLICY IF EXISTS "Service role full access seo_suggestions" ON public.seo_suggestions;
