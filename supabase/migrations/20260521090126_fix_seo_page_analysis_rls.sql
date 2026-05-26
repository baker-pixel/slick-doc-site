-- Drop the overly permissive "Service role full access" policy.
-- Service role bypasses RLS in Supabase by default, so this policy
-- served no purpose but allowed anon/authenticated to read all rows.
DROP POLICY IF EXISTS "Service role full access SEO analysis" ON public.seo_page_analysis;

-- Drop the duplicate client SELECT policy added in 20260520100000.
-- "Clients can view their SEO analysis" (from the original table migration)
-- already covers this — two identical USING-clause policies are redundant.
DROP POLICY IF EXISTS "Clients view their seo_page_analysis" ON public.seo_page_analysis;
