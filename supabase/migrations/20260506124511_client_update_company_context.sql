-- SECURITY DEFINER function so portal clients can update only the context fields
-- on their own client_account row. Bypasses RLS safely because it explicitly
-- checks ownership and restricts which columns are written.

CREATE OR REPLACE FUNCTION public.client_update_company_context(
  p_client_account_id UUID,
  p_industry          TEXT,
  p_website_url       TEXT,
  p_website_summary   TEXT,
  p_tone              TEXT,
  p_context_profile   JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the calling user owns this client account
  IF NOT EXISTS (
    SELECT 1 FROM client_portal_users
    WHERE user_id = auth.uid()
      AND client_account_id = p_client_account_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE client_accounts
  SET
    industry        = p_industry,
    website_url     = p_website_url,
    website_summary = p_website_summary,
    tone            = p_tone,
    context_profile = p_context_profile,
    updated_at      = now()
  WHERE id = p_client_account_id;
END;
$$;

-- Only authenticated users can call this function
REVOKE ALL ON FUNCTION public.client_update_company_context FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_update_company_context TO authenticated;
