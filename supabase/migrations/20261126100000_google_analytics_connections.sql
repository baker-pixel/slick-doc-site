-- Google Analytics (GA4) connection per client, via the client's own Google account (OAuth).
-- Tokens live here, NOT in client_oauth_tokens: that table lets portal users SELECT their own
-- rows from the browser, which would expose refresh tokens. This table has RLS on and no
-- policies, so only edge functions (service role) can touch it. Tokens are AES-GCM encrypted
-- by the edge functions (secret GOOGLE_TOKEN_KEY) before they are written.
CREATE TABLE IF NOT EXISTS public.google_analytics_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  google_email text,
  refresh_token_enc text NOT NULL,
  access_token_enc text,
  expires_at timestamptz,
  scopes text,
  property_id text,        -- 'properties/123456'
  property_name text,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'needs_reconnect')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_analytics_connections ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: service role only.
