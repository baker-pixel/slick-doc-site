-- connected_sites: WordPress sites connected via the OrangeDoor plugin
CREATE TABLE public.connected_sites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID REFERENCES public.client_accounts(id) ON DELETE SET NULL,
  site_url        TEXT NOT NULL,
  token           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'connected',  -- connected | unreachable | disconnected
  yoast_active    BOOLEAN NOT NULL DEFAULT false,
  rankmath_active BOOLEAN NOT NULL DEFAULT false,
  plugin_version  TEXT,
  wp_version      TEXT,
  last_scanned_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX connected_sites_site_url_idx ON public.connected_sites(site_url);
CREATE INDEX connected_sites_client_id_idx ON public.connected_sites(client_id);

ALTER TABLE public.connected_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages connected_sites"
ON public.connected_sites FOR ALL
TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Clients view their own connected_sites"
ON public.connected_sites FOR SELECT
USING (
  client_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
);


-- scan_results: raw scan snapshots from the plugin
CREATE TABLE public.scan_results (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      UUID NOT NULL REFERENCES public.connected_sites(id) ON DELETE CASCADE,
  scanned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_data     JSONB NOT NULL DEFAULT '{}',
  total_issues INT NOT NULL DEFAULT 0,
  errors       INT NOT NULL DEFAULT 0,
  warnings     INT NOT NULL DEFAULT 0,
  notices      INT NOT NULL DEFAULT 0
);

CREATE INDEX scan_results_site_id_idx ON public.scan_results(site_id);

ALTER TABLE public.scan_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages scan_results"
ON public.scan_results FOR ALL
TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Clients view their own scan_results"
ON public.scan_results FOR SELECT
USING (
  site_id IN (
    SELECT id FROM public.connected_sites
    WHERE client_id IN (
      SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
    )
  )
);


-- wp_fix_queue: AI-suggested fixes generated from plugin scan data
CREATE TABLE public.wp_fix_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         UUID NOT NULL REFERENCES public.connected_sites(id) ON DELETE CASCADE,
  scan_id         UUID REFERENCES public.scan_results(id) ON DELETE SET NULL,
  post_id         INT,
  media_id        INT,
  page_title      TEXT,
  page_url        TEXT,
  field           TEXT NOT NULL,
  current_value   TEXT,
  suggested_value TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | applied | failed
  applied_at      TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX wp_fix_queue_site_id_idx ON public.wp_fix_queue(site_id);
CREATE INDEX wp_fix_queue_status_idx  ON public.wp_fix_queue(status);

ALTER TABLE public.wp_fix_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages wp_fix_queue"
ON public.wp_fix_queue FOR ALL
TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Clients view their own wp_fix_queue"
ON public.wp_fix_queue FOR SELECT
USING (
  site_id IN (
    SELECT id FROM public.connected_sites
    WHERE client_id IN (
      SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Clients update status on their own wp_fix_queue"
ON public.wp_fix_queue FOR UPDATE
USING (
  site_id IN (
    SELECT id FROM public.connected_sites
    WHERE client_id IN (
      SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
    )
  )
)
WITH CHECK (
  site_id IN (
    SELECT id FROM public.connected_sites
    WHERE client_id IN (
      SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
    )
  )
);


-- Auto-update updated_at for connected_sites and wp_fix_queue
CREATE TRIGGER connected_sites_updated_at
BEFORE UPDATE ON public.connected_sites
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER wp_fix_queue_updated_at
BEFORE UPDATE ON public.wp_fix_queue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
