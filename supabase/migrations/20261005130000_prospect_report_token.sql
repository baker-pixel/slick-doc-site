-- Public, unguessable link token for a Quick Analysis lead's online report
-- (/quick-report/:token). Lookups go through the get-prospect-report edge
-- function, never a direct anon read of `prospects` (which holds contact data).
-- A real UNIQUE constraint (not a partial index) so it's usable for lookups/upserts.
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS report_token uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.prospects
  ADD CONSTRAINT prospects_report_token_key UNIQUE (report_token);

COMMENT ON COLUMN public.prospects.report_token IS
  'Random token for the shareable online Quick Analysis report link (/quick-report/:token).';
