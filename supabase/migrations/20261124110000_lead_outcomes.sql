-- Lead outcomes: (1) which Apollo search produced leads that actually engaged,
-- and (2) the "interested, no reply" list the portal shows for human follow-up.
--
-- 1) discover-prospects-web now stamps research_snapshot.found_by = {key,label}
--    on every new Apollo lead. This view rolls outcomes up per client + search so
--    the discovery agent can be told which keywords worked, not just which ones
--    returned fresh companies. Leads found before this migration carry no
--    found_by and are not attributed.
--    Service role only (it spans clients); security_invoker keeps RLS in force
--    for anyone else who is ever granted access.
CREATE OR REPLACE VIEW public.prospect_search_performance
WITH (security_invoker = true) AS
SELECT
  p.client_id,
  p.research_snapshot->'found_by'->>'label' AS search_label,
  count(*)                                   AS leads,
  count(*) FILTER (
    WHERE p.status NOT IN ('discovered', 'rejected', 'pending')
      AND (p.drip_step >= 1 OR p.status IN ('replied', 'converted', 'exhausted', 'bounced', 'unsubscribed'))
  )                                          AS emailed,
  count(*) FILTER (WHERE p.clicked_at IS NOT NULL) AS clicked,
  count(*) FILTER (WHERE p.status IN ('replied', 'converted') OR p.replied_at IS NOT NULL) AS replied
FROM public.prospects p
WHERE p.research_snapshot->'found_by'->>'label' IS NOT NULL
GROUP BY p.client_id, p.research_snapshot->'found_by'->>'label';

REVOKE ALL ON public.prospect_search_performance FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.prospect_search_performance TO service_role;

-- 2) Leads whose sequence finished, who clicked, and never replied. A click in
--    the first 60 seconds after the first send is a mail-security scanner
--    following the link, not a person (same rule outreach_human_opened_ids uses
--    for opens), so it does not count. Contact fields are returned so the
--    client can follow up themselves; same auth check as client_outreach_stats.
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
  IF NOT EXISTS (
    SELECT 1 FROM client_portal_users cpu
    WHERE cpu.user_id = auth.uid() AND cpu.client_account_id = p_client_account_id
  ) THEN
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

REVOKE ALL ON FUNCTION public.client_warm_leads(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_warm_leads(UUID) TO authenticated;
