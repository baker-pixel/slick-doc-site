-- Companion to client_get_prospect_emails: exposes the next pending
-- email_queue row for a prospect so the client portal can show "next
-- scheduled" alongside sent history, mirroring the admin-side
-- get_prospect_emails action in the admin edge function.
CREATE OR REPLACE FUNCTION public.client_get_prospect_next_email(
  p_client_account_id UUID,
  p_prospect_id        UUID
)
RETURNS TABLE (
  subject       TEXT,
  scheduled_for TIMESTAMPTZ
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
  SELECT eq.subject, eq.scheduled_for
  FROM email_queue eq
  WHERE eq.metadata->>'prospect_id' = p_prospect_id::TEXT
    AND eq.metadata->>'client_id' = p_client_account_id::TEXT
    AND eq.status = 'pending'
  ORDER BY eq.scheduled_for ASC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.client_get_prospect_next_email FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_get_prospect_next_email TO authenticated;
