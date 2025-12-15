-- Create table for client platform credentials/access info
CREATE TABLE public.client_platform_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  platform_type TEXT NOT NULL, -- 'social_media', 'analytics', 'website', 'email', 'other'
  platform_name TEXT NOT NULL, -- 'Facebook', 'Instagram', 'Google Analytics', 'WordPress', etc.
  login_url TEXT,
  username TEXT,
  password TEXT,
  additional_info JSONB DEFAULT '{}'::jsonb, -- For 2FA codes, API keys, etc.
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_platform_credentials ENABLE ROW LEVEL SECURITY;

-- Clients can manage their own credentials
CREATE POLICY "Clients can view their credentials"
  ON public.client_platform_credentials
  FOR SELECT
  USING (client_account_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Clients can insert their credentials"
  ON public.client_platform_credentials
  FOR INSERT
  WITH CHECK (client_account_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Clients can update their credentials"
  ON public.client_platform_credentials
  FOR UPDATE
  USING (client_account_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Clients can delete their credentials"
  ON public.client_platform_credentials
  FOR DELETE
  USING (client_account_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  ));

-- Admins can manage all credentials
CREATE POLICY "Admins can manage all credentials"
  ON public.client_platform_credentials
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add updated_at trigger
CREATE TRIGGER update_client_platform_credentials_updated_at
  BEFORE UPDATE ON public.client_platform_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();