-- 1. Lets a client set a signature (name/title) and a primary CTA
--    (label/url) for their AI-drafted prospect outreach emails.
--    run-prospect-drip reads this to replace the hardcoded
--    "-- {business_name}" signoff and raw website_url CTA.
ALTER TABLE client_accounts
  ADD COLUMN IF NOT EXISTS outreach_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.client_update_outreach_settings(
  p_client_account_id UUID,
  p_settings           JSONB
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
  SET outreach_settings = p_settings,
      updated_at        = now()
  WHERE id = p_client_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.client_update_outreach_settings FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_update_outreach_settings TO authenticated;

-- 2. client_get_prospect_emails used to read email_logs for sent history
--    only (subject/status/sent_at), which has no html_content column at
--    all -- there was no way to show a client the actual email body.
--    email_queue is the real source of truth for full content: rows
--    persist with status flipped to sent/failed/skipped/cancelled, never
--    deleted (see run-prospect-drip's cancelPendingQueuedEmails), so one
--    query against it covers sent AND still-scheduled steps together.
DROP FUNCTION IF EXISTS public.client_get_prospect_emails(UUID, UUID);

CREATE FUNCTION public.client_get_prospect_emails(
  p_client_account_id UUID,
  p_prospect_id        UUID
)
RETURNS TABLE (
  drip_step     INT,
  subject       TEXT,
  html_content  TEXT,
  status        TEXT,
  scheduled_for TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ
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
    (eq.metadata->>'drip_step')::INT,
    eq.subject,
    eq.html_content,
    eq.status,
    eq.scheduled_for,
    eq.sent_at
  FROM email_queue eq
  WHERE eq.metadata->>'prospect_id' = p_prospect_id::TEXT
    AND eq.metadata->>'client_id' = p_client_account_id::TEXT
  ORDER BY eq.scheduled_for ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.client_get_prospect_emails FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_get_prospect_emails TO authenticated;

-- client_get_prospect_next_email is superseded by the query above (which
-- now includes scheduled rows too) -- left in place, unused, rather than
-- dropped, since nothing else calls it and dropping a shipped function
-- for no functional reason is needless churn.
