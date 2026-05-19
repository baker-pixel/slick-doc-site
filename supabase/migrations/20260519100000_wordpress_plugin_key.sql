-- Add plugin API key column to client_credentials
ALTER TABLE public.client_credentials
  ADD COLUMN IF NOT EXISTS wordpress_plugin_api_key TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
