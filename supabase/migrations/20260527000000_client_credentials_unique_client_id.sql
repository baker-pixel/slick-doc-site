-- Deduplicate: keep the latest row per client_id before adding constraint
DELETE FROM public.client_credentials
WHERE id NOT IN (
  SELECT DISTINCT ON (client_id) id
  FROM public.client_credentials
  ORDER BY client_id, created_at DESC
);

ALTER TABLE public.client_credentials
  ADD CONSTRAINT client_credentials_client_id_unique UNIQUE (client_id);
