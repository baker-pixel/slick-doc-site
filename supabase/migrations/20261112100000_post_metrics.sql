-- Client-portal access to per-post performance numbers, and an hourly refresh.
-- The post_metrics table and the sync-post-metrics function come from the
-- Social steward work (migration 20261102120000, feat/steward-foundation); the
-- table is declared here too (IF NOT EXISTS) so this branch stands alone.
-- Columns: views = LinkedIn/X impressions or Instagram views (Facebook has none);
-- reach = unique people (Facebook, Instagram).
CREATE TABLE IF NOT EXISTS public.post_metrics (
  calendar_id uuid PRIMARY KEY REFERENCES public.content_calendar(id) ON DELETE CASCADE,
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  platform text NOT NULL,
  pfm_account_id text,
  platform_post_id text,
  posted_at timestamptz,
  views integer,
  reach integer,
  likes integer,
  comments integer,
  shares integer,
  clicks integer,
  saves integer,
  engagements integer,
  raw jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS post_metrics_client_posted_idx ON public.post_metrics (client_account_id, posted_at DESC);
ALTER TABLE public.post_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_metrics FROM anon;

DROP POLICY IF EXISTS "Admin role can read post_metrics" ON public.post_metrics;
CREATE POLICY "Admin role can read post_metrics" ON public.post_metrics
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Clients read only their own rows.
DROP POLICY IF EXISTS "post_metrics_client_select" ON public.post_metrics;
CREATE POLICY "post_metrics_client_select" ON public.post_metrics
  FOR SELECT TO authenticated
  USING (client_account_id IN (SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()));

-- Hourly: each run refreshes the 20 posts most in need of it.
do $$ begin perform cron.unschedule('sync-post-metrics'); exception when others then null; end $$;
select cron.schedule('sync-post-metrics', '20 * * * *', $cmd$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/sync-post-metrics',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key(),
      'x-internal-secret', (select value from public.internal_secrets where key = 'pipeline_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cmd$);
