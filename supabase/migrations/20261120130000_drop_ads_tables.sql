-- generate-ads (the AI ad generator) had no caller and was removed. Its tables were unused:
-- ad_campaigns and ad_campaign_analytics had 0 rows; ad_templates only held 7 generic seed rows.
DROP TABLE IF EXISTS public.ad_campaign_analytics;
DROP TABLE IF EXISTS public.ad_campaigns;
DROP TABLE IF EXISTS public.ad_templates;
