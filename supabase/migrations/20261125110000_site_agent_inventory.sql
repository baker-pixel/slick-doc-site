-- Scans for agent (v2) sites. We cannot call the site, so a scan works like this:
--   1. someone asks for a scan -> connected_sites.scan_requested_at is set
--   2. the plugin sees scan_requested on its next heartbeat and uploads its page
--      inventory in small parts (one request each, so no PHP/body limits are hit)
--   3. when the last part arrives, site-agent assembles the parts and runs the
--      same analysis the v1 scan does (scan-wordpress-site)
ALTER TABLE public.connected_sites
  ADD COLUMN IF NOT EXISTS scan_requested_at timestamptz;

CREATE TABLE IF NOT EXISTS public.site_inventory_chunks (
  upload_id  text        NOT NULL,
  part       integer     NOT NULL,   -- -1 is the "assembled" marker: only one inserter wins it
  site_id    uuid        NOT NULL REFERENCES public.connected_sites(id) ON DELETE CASCADE,
  kind       text        NOT NULL,
  payload    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (upload_id, part)
);
CREATE INDEX IF NOT EXISTS site_inventory_chunks_site_idx ON public.site_inventory_chunks (site_id, created_at);

ALTER TABLE public.site_inventory_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages site_inventory_chunks"
  ON public.site_inventory_chunks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Parts are deleted when a scan finishes; this catches abandoned uploads.
SELECT cron.schedule(
  'site-inventory-cleanup',
  '40 3 * * *',
  $$DELETE FROM public.site_inventory_chunks WHERE created_at < now() - interval '1 day'$$
);
