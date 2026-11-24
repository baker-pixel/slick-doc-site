-- The admin "view as client" mode runs the portal as the admin's own session. These portal RPCs
-- only accepted a client_portal_users row, so an admin saw an empty "Sequence timeline"
-- ("Nothing queued yet") for leads that had in fact finished their sequence. Admins may read
-- any client's portal data, so let them through; client users still need their own row.

CREATE OR REPLACE FUNCTION public.portal_can_view(p_client_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM client_portal_users cpu
        WHERE cpu.user_id = auth.uid() AND cpu.client_account_id = p_client_account_id
      );
$$;

REVOKE ALL ON FUNCTION public.portal_can_view(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_can_view(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.client_get_prospect_emails(p_client_account_id uuid, p_prospect_id uuid)
 RETURNS TABLE(drip_step integer, subject text, html_content text, status text, scheduled_for timestamp with time zone, sent_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.portal_can_view(p_client_account_id) THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.client_get_prospect_next_email(p_client_account_id uuid, p_prospect_id uuid)
 RETURNS TABLE(subject text, scheduled_for timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.portal_can_view(p_client_account_id) THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.client_outreach_stats(p_client_account_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  human UUID[];
  result JSONB;
BEGIN
  IF NOT public.portal_can_view(p_client_account_id) THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.client_warm_leads(p_client_account_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  website_url TEXT,
  business_type TEXT,
  clicked_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  emails_sent INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.portal_can_view(p_client_account_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  WITH sends AS (
    SELECT (q.metadata->>'prospect_id')::uuid AS pid,
           min(q.sent_at) AS first_sent,
           max(q.sent_at) AS last_sent,
           count(*)::int  AS n
    FROM email_queue q
    WHERE q.status = 'sent'
      AND q.metadata->>'client_id' = p_client_account_id::text
      AND q.metadata->>'prospect_id' IS NOT NULL
    GROUP BY 1
  )
  SELECT p.id, p.name, p.email, p.website_url, p.business_type,
         p.clicked_at, s.last_sent, COALESCE(s.n, 0)
  FROM prospects p
  LEFT JOIN sends s ON s.pid = p.id
  WHERE p.client_id = p_client_account_id
    AND p.campaign_id IS NULL
    AND p.status = 'exhausted'
    AND p.replied_at IS NULL
    AND p.clicked_at IS NOT NULL
    AND (s.first_sent IS NULL OR p.clicked_at >= s.first_sent + interval '60 seconds')
  ORDER BY p.clicked_at DESC;
END;
$$;
