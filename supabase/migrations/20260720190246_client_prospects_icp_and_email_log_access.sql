-- Two SECURITY DEFINER RPCs for the client-portal Lead Outreach redesign,
-- following the ownership-check pattern in client_update_company_context.

-- 1. Lets a client edit their own ICP (used by prospect discovery + fit
--    scoring). Previously `client_accounts.icp` was only ever written by
--    ensureClientICP() (supabase/functions/_shared/icp.ts) once, then cached
--    forever -- clients had no way to correct or refine it.
CREATE OR REPLACE FUNCTION public.client_update_icp(
  p_client_account_id UUID,
  p_icp                JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM client_portal_users
    WHERE user_id = auth.uid()
      AND client_account_id = p_client_account_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE client_accounts
  SET icp        = p_icp,
      updated_at = now()
  WHERE id = p_client_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.client_update_icp FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_update_icp TO authenticated;

-- 2. Lets a client see the outreach emails sent for one of their prospects.
--    email_logs has no client_id column and no RLS scoping by client (it's
--    only ever queried from admin-authed panels today), so it can't be
--    exposed to the portal via a direct table select -- this scopes it by
--    checking the prospect belongs to the caller's client_account first.
CREATE OR REPLACE FUNCTION public.client_get_prospect_emails(
  p_client_account_id UUID,
  p_prospect_id        UUID
)
RETURNS TABLE (
  subject  TEXT,
  status   TEXT,
  sent_at  TIMESTAMPTZ,
  drip_step INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM client_portal_users
    WHERE user_id = auth.uid()
      AND client_account_id = p_client_account_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM prospects
    WHERE id = p_prospect_id
      AND client_id = p_client_account_id
  ) THEN
    RAISE EXCEPTION 'Prospect not found';
  END IF;

  RETURN QUERY
  SELECT
    el.subject,
    el.status,
    el.sent_at,
    (el.metadata->>'drip_step')::INT
  FROM email_logs el
  WHERE el.metadata->>'prospect_id' = p_prospect_id::TEXT
    AND el.metadata->>'client_id' = p_client_account_id::TEXT
  ORDER BY el.sent_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.client_get_prospect_emails FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_get_prospect_emails TO authenticated;
