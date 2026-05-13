-- Make brand-assets bucket private and replace bucket_id-only policies
-- with path-scoped policies (path convention: {client_account_id}/{filename}).

UPDATE storage.buckets SET public = false WHERE id = 'brand-assets';

DROP POLICY IF EXISTS "Anyone can view brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete brand assets" ON storage.objects;

-- Admins: full access to the bucket
CREATE POLICY "Admins full access to brand asset files"
ON storage.objects FOR ALL
USING (
  bucket_id = 'brand-assets'
  AND has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  bucket_id = 'brand-assets'
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Clients: read files under their client_account_id path only
CREATE POLICY "Clients read own brand asset files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'brand-assets'
  AND (storage.foldername(name))[1] IN (
    SELECT client_account_id::text FROM public.client_portal_users WHERE user_id = auth.uid()
  )
);

-- Clients: upload files under their client_account_id path only
CREATE POLICY "Clients upload own brand asset files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'brand-assets'
  AND (storage.foldername(name))[1] IN (
    SELECT client_account_id::text FROM public.client_portal_users WHERE user_id = auth.uid()
  )
);

-- Clients: delete files under their client_account_id path only
CREATE POLICY "Clients delete own brand asset files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'brand-assets'
  AND (storage.foldername(name))[1] IN (
    SELECT client_account_id::text FROM public.client_portal_users WHERE user_id = auth.uid()
  )
);
