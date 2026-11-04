-- Accurate outreach numbers for the client portal.
--
-- Three things the portal showed wrong, all fixed by computing in one place:
--   1. "Emailed" counted every non-pending lead, including leads queued but
--      not sent yet and leads converted without ever being emailed. A lead
--      is emailed when drip_step > 0 (run-prospect-drip bumps it on send).
--   2. Opens were inflated by security scanners that fetch the tracking
--      pixel seconds after delivery. An open within 60s of the first send
--      is not counted as a person opening it.
--   3. Home "New Leads" counted leads the Lead Outreach tab hides
--      (status 'discovered') and Apollo dead-ends with no email. It now
--      counts only contactable, visible pipeline leads.
-- Campaign (CSV/topic) prospects stay out of all of this (campaign_id IS NULL).

CREATE OR REPLACE FUNCTION public.outreach_human_opened_ids(p_client_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH first_send AS (
    SELECT (q.metadata->>'prospect_id')::uuid AS prospect_id, min(q.sent_at) AS first_sent
    FROM email_queue q
    WHERE q.status = 'sent'
      AND q.metadata->>'client_id' = p_client_id::text
      AND q.metadata->>'prospect_id' IS NOT NULL
    GROUP BY 1
  )
  SELECT COALESCE(array_agg(p.id), '{}')
  FROM prospects p
  LEFT JOIN first_send f ON f.prospect_id = p.id
  WHERE p.client_id = p_client_id
    AND p.campaign_id IS NULL
    AND p.opened_at IS NOT NULL
    AND (f.first_sent IS NULL OR p.opened_at >= f.first_sent + interval '60 seconds');
$$;

-- All-time pipeline stats for one client (portal Lead Outreach tab).
CREATE OR REPLACE FUNCTION public.client_outreach_stats(p_client_account_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  human UUID[];
  result JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM client_portal_users
    WHERE user_id = auth.uid() AND client_account_id = p_client_account_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  human := public.outreach_human_opened_ids(p_client_account_id);

  SELECT jsonb_build_object(
    'total',     count(*) FILTER (WHERE status <> 'discovered'),
    'emailed',   count(*) FILTER (WHERE status <> 'discovered' AND drip_step > 0),
    'opened',    count(*) FILTER (WHERE status <> 'discovered' AND drip_step > 0 AND id = ANY(human)),
    'replied',   count(*) FILTER (WHERE status IN ('replied','converted') AND drip_step > 0),
    'bounced',   count(*) FILTER (WHERE status = 'bounced'),
    'converted', count(*) FILTER (WHERE status = 'converted'),
    'human_opened_ids', to_jsonb(human)
  ) INTO result
  FROM prospects
  WHERE client_id = p_client_account_id AND campaign_id IS NULL;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.client_outreach_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_outreach_stats(UUID) TO authenticated;

-- Windowed numbers for client_analytics (weekly recap + admin panel). Service
-- role only: both callers are edge functions.
CREATE OR REPLACE FUNCTION public.outreach_period_metrics(
  p_client_id UUID,
  p_start TIMESTAMPTZ,
  p_end_exclusive TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH human AS (SELECT unnest(public.outreach_human_opened_ids(p_client_id)) AS id)
  SELECT jsonb_build_object(
    'leads_generated', count(*) FILTER (
      WHERE p.created_at >= p_start AND p.created_at < p_end_exclusive
        AND p.status <> 'discovered' AND COALESCE(p.email, '') <> ''),
    'email_opens', count(*) FILTER (
      WHERE p.opened_at >= p_start AND p.opened_at < p_end_exclusive
        AND p.id IN (SELECT id FROM human)),
    'email_clicks', count(*) FILTER (
      WHERE p.clicked_at >= p_start AND p.clicked_at < p_end_exclusive)
  )
  FROM prospects p
  WHERE p.client_id = p_client_id AND p.campaign_id IS NULL;
$$;

REVOKE ALL ON FUNCTION public.outreach_period_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_period_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION public.outreach_human_opened_ids(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_human_opened_ids(UUID) TO service_role;
