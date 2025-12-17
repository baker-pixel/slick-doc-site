-- Drop the restrictive policy and create a simpler one for authenticated users
DROP POLICY IF EXISTS "Admins can upload team photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update team photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete team photos" ON storage.objects;

-- Create policies that allow any authenticated user to manage team photos
CREATE POLICY "Authenticated users can upload team photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'team-photos');

CREATE POLICY "Authenticated users can update team photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'team-photos');

CREATE POLICY "Authenticated users can delete team photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'team-photos');