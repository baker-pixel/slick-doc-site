-- Create the assets bucket for storing public files like PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', true);

-- Allow public read access to the assets bucket
CREATE POLICY "Public can read assets"
ON storage.objects
FOR SELECT
USING (bucket_id = 'assets');

-- Allow authenticated users to upload assets (for admin use)
CREATE POLICY "Admin can upload assets"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'assets');