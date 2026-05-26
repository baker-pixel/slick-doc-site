-- Allow clients to read their own page-level SEO analysis
CREATE POLICY "Clients view their seo_page_analysis"
ON public.seo_page_analysis FOR SELECT
USING (
  client_account_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
);

-- Allow clients to update status on their own ai_fixes (approve/reject)
CREATE POLICY "Clients update status on their own ai_fixes"
ON public.ai_fixes FOR UPDATE
USING (
  client_account_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  client_account_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
);