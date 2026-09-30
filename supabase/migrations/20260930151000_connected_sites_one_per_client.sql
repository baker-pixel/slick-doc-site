-- One WordPress connection per client. prepare-connection could previously
-- leave a client with two rows (typo'd URL, then the corrected one); every
-- reader uses .maybeSingle(), which errors on 2 rows and silently rendered
-- "not connected". No upsert targets client_id, so a partial unique index is safe here.
CREATE UNIQUE INDEX IF NOT EXISTS connected_sites_one_per_client_idx
  ON public.connected_sites (client_id)
  WHERE client_id IS NOT NULL;
