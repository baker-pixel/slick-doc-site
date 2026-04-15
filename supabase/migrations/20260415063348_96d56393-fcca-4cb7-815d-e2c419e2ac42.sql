CREATE POLICY "Authenticated users can insert brand assets"
ON public.brand_assets
FOR INSERT TO authenticated
WITH CHECK (true);