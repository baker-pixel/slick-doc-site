-- Add missing columns to client_oauth_tokens
ALTER TABLE public.client_oauth_tokens
  ADD COLUMN IF NOT EXISTS refresh_token text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS page_id text;

-- Add unique constraint (client_id + platform)
ALTER TABLE public.client_oauth_tokens
  DROP CONSTRAINT IF EXISTS client_oauth_tokens_client_platform_unique;

ALTER TABLE public.client_oauth_tokens
  ADD CONSTRAINT client_oauth_tokens_client_platform_unique UNIQUE (client_id, platform);

-- Drop overly-broad existing policies
DROP POLICY IF EXISTS "Admins can manage client_oauth_tokens" ON public.client_oauth_tokens;
DROP POLICY IF EXISTS "Service role full access client_oauth_tokens" ON public.client_oauth_tokens;

-- Admins can read all
CREATE POLICY "Admins can read all oauth tokens"
  ON public.client_oauth_tokens
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Admins can manage all
CREATE POLICY "Admins can manage all oauth tokens"
  ON public.client_oauth_tokens
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Service role full access
CREATE POLICY "Service role full access oauth tokens"
  ON public.client_oauth_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Clients can view their own tokens
CREATE POLICY "Clients can view their oauth tokens"
  ON public.client_oauth_tokens
  FOR SELECT
  TO authenticated
  USING (client_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  ));

-- Clients can insert their own tokens
CREATE POLICY "Clients can insert their oauth tokens"
  ON public.client_oauth_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (client_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  ));

-- Clients can update their own tokens
CREATE POLICY "Clients can update their oauth tokens"
  ON public.client_oauth_tokens
  FOR UPDATE
  TO authenticated
  USING (client_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  ));

-- Clients can delete (disconnect) their own tokens
CREATE POLICY "Clients can delete their oauth tokens"
  ON public.client_oauth_tokens
  FOR DELETE
  TO authenticated
  USING (client_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  ));