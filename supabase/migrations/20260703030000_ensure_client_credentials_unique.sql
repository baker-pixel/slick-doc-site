-- Two migrations shared timestamp 20260527000000, so only one of them was
-- ever applied to remote. This idempotently ensures the client_credentials
-- unique constraint exists regardless of which one ran.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_credentials_client_id_unique'
  ) THEN
    -- Deduplicate: keep the latest row per client_id before adding constraint
    DELETE FROM public.client_credentials
    WHERE id NOT IN (
      SELECT DISTINCT ON (client_id) id
      FROM public.client_credentials
      ORDER BY client_id, created_at DESC
    );

    ALTER TABLE public.client_credentials
      ADD CONSTRAINT client_credentials_client_id_unique UNIQUE (client_id);
  END IF;
END $$;
