-- Dedupe was a SELECT-then-INSERT check with no DB constraint backing it --
-- fine when discovery only ever had one admin-driven caller, but now the
-- daily auto-discover-prospects cron and the client-portal "Find leads now"
-- button can both run for the same client, racing the same check and both
-- inserting a row for the same business.
--
-- Clean up any duplicates first: keep the earliest row per (client_id,
-- website_url), and only drop later duplicates that are still status
-- 'discovered' (never approved/contacted), so no outreach history is lost.
DELETE FROM public.prospects a
USING public.prospects b
WHERE a.client_id = b.client_id
  AND a.website_url = b.website_url
  AND a.website_url <> ''
  AND a.status = 'discovered'
  AND (a.created_at, a.id) > (b.created_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_client_website_unique
  ON public.prospects (client_id, website_url)
  WHERE website_url <> '';
