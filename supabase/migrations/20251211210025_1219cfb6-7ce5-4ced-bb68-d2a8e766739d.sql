-- Add unique constraint for upsert operations on seo_page_analysis
ALTER TABLE public.seo_page_analysis 
ADD CONSTRAINT seo_page_analysis_client_url_unique 
UNIQUE (client_account_id, url);