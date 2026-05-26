-- Add stored seo_score to scan_results so it can be queried/sorted directly
-- Score is computed: max(0, min(100, 100 - errors*8 - warnings*3 - notices))
-- Populated by scan-wordpress-site on each scan

ALTER TABLE public.scan_results
  ADD COLUMN IF NOT EXISTS seo_score INT NOT NULL DEFAULT 0;
