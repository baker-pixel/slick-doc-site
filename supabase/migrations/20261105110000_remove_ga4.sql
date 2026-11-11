-- Retire the Google Analytics (GA4) integration; website traffic now comes from
-- the WordPress plugin (20261105100000_first_party_traffic.sql).
--
-- APPLY ORDER: deploy the code that no longer reads ga4_property_id first, apply
-- 20261105100000 and confirm the plugin pilot works, and only then apply this.
-- Dropping the column breaks any still-deployed function or frontend that
-- selects it (the old admin analytics panel, sync-ga4-analytics).
--
-- Checked on the live DB before writing this: no client has a ga4_property_id,
-- no client has a google_analytics OAuth token, and there is no active
-- google_analytics integration_configs row, so nothing of value is deleted.

DO $$ BEGIN PERFORM cron.unschedule('sync-ga4-analytics'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

DELETE FROM public.client_oauth_tokens WHERE platform = 'google_analytics';
DELETE FROM public.integration_configs WHERE integration_type = 'google_analytics';

ALTER TABLE public.client_accounts DROP COLUMN IF EXISTS ga4_property_id;
