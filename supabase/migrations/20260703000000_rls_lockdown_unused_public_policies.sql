-- =============================================================
-- RLS lockdown: policies with USING (true) and no TO clause
-- apply to ALL roles (anon + authenticated), not just service
-- role. Service role BYPASSES RLS entirely, so these policies
-- only served to accidentally expose the tables publicly.
--
-- Only tables with no direct browser access are locked here —
-- the password-based admin panel still queries many tables as
-- anon, so those keep their permissive policies until admin
-- auth is migrated to Supabase users with has_role('admin').
-- =============================================================

-- email_preferences: managed exclusively via the `unsubscribe`
-- edge function (service role). Public read/write allowed anyone
-- to enumerate subscribers and unsubscribe arbitrary emails.
DROP POLICY IF EXISTS "Anyone can view preferences by email" ON public.email_preferences;
DROP POLICY IF EXISTS "Anyone can insert preferences" ON public.email_preferences;
DROP POLICY IF EXISTS "Anyone can update preferences" ON public.email_preferences;

-- outreach_campaigns: server-side only (run-prospect-drip).
DROP POLICY IF EXISTS "Service role full access on outreach_campaigns" ON public.outreach_campaigns;
DROP POLICY IF EXISTS "Admin can read outreach_campaigns" ON public.outreach_campaigns;

-- client_usage: server-side cost tracking only.
DROP POLICY IF EXISTS "Service role full access on client_usage" ON public.client_usage;
DROP POLICY IF EXISTS "Admin can read client_usage" ON public.client_usage;
DROP POLICY IF EXISTS "Admin can insert client_usage" ON public.client_usage;

-- client_context_versions: server-side ICP snapshots only.
DROP POLICY IF EXISTS "Service role full access on client_context_versions" ON public.client_context_versions;

-- email_cleanup_log: server-side maintenance log only.
DROP POLICY IF EXISTS "Service role can manage cleanup_log" ON public.email_cleanup_log;

-- Future admin (Supabase-auth'd with admin role) read access:
CREATE POLICY "Admin role can read outreach_campaigns"
  ON public.outreach_campaigns FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin role can read client_usage"
  ON public.client_usage FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin role can read client_context_versions"
  ON public.client_context_versions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
