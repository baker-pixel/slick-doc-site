-- Tables with 0 rows, no code or database-function references, and no incoming foreign keys.
-- Superseded: outreach_campaigns (prospect_campaigns), social_media_posts (content_calendar),
-- client_integrations / client_platform_credentials (client_oauth_tokens, client_postforme_accounts).
-- Never used: seo_page_analysis, seo_suggestions, voice_memos, task_notifications, qa_checkpoints.
DROP TABLE IF EXISTS public.outreach_campaigns;
DROP TABLE IF EXISTS public.social_media_posts;
DROP TABLE IF EXISTS public.client_integrations;
DROP TABLE IF EXISTS public.client_platform_credentials;
DROP TABLE IF EXISTS public.seo_page_analysis;
DROP TABLE IF EXISTS public.seo_suggestions;
DROP TABLE IF EXISTS public.voice_memos;
DROP TABLE IF EXISTS public.task_notifications;
DROP TABLE IF EXISTS public.qa_checkpoints;
