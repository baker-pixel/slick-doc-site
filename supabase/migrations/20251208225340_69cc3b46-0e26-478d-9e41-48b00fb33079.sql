-- Create brand assets table
CREATE TABLE public.brand_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  asset_type TEXT NOT NULL DEFAULT 'other',
  category TEXT NOT NULL DEFAULT 'general',
  file_path TEXT,
  file_url TEXT,
  file_size INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;

-- Clients can view their brand assets
CREATE POLICY "Clients can view their brand assets"
ON public.brand_assets
FOR SELECT
USING (client_account_id IN (
  SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
));

-- Admins can manage all brand assets
CREATE POLICY "Admins can manage all brand assets"
ON public.brand_assets
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_brand_assets_updated_at
BEFORE UPDATE ON public.brand_assets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for brand assets if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for brand assets bucket
CREATE POLICY "Anyone can view brand assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'brand-assets');

CREATE POLICY "Admins can upload brand assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'brand-assets');

CREATE POLICY "Admins can update brand assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'brand-assets');

CREATE POLICY "Admins can delete brand assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'brand-assets');