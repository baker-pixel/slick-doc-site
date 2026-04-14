DROP POLICY IF EXISTS "Anyone can insert prospects" ON public.prospects;

CREATE POLICY "Anyone can insert prospects"
ON public.prospects
FOR INSERT
TO anon, authenticated
WITH CHECK (true);