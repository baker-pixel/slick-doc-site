-- One windowed source of truth for the portal Analytics tab (leads / email opens / clicks, with the
-- previous window for trends and a per-day series for charts).
--
-- Definitions match outreach_period_metrics (what the weekly recap and the snapshot use), so the
-- Analytics tab agrees with Home and Lead Outreach:
--   * pipeline prospects only (campaign_id IS NULL)
--   * leads  = created in the window, not 'discovered', with an email
--   * opens  = HUMAN opens only (mail-security scanners excluded via outreach_human_opened_ids)
--   * clicks = clicked_at in the window
-- Window = the last p_days days INCLUDING today (UTC), so 7 -> today and the 6 days before it.
CREATE OR REPLACE FUNCTION public.client_analytics_overview(p_client_account_id uuid, p_days integer DEFAULT 28)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  d integer := LEAST(GREATEST(COALESCE(p_days, 28), 1), 365);
  win_start date := (now() AT TIME ZONE 'utc')::date - (LEAST(GREATEST(COALESCE(p_days, 28), 1), 365) - 1);
  prev_start date := (now() AT TIME ZONE 'utc')::date - (LEAST(GREATEST(COALESCE(p_days, 28), 1), 365) - 1) - LEAST(GREATEST(COALESCE(p_days, 28), 1), 365);
  win_end_excl date := (now() AT TIME ZONE 'utc')::date + 1;
  human uuid[];
  result jsonb;
BEGIN
  IF NOT public.portal_can_view(p_client_account_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  human := public.outreach_human_opened_ids(p_client_account_id);

  WITH p AS (
    SELECT created_at, opened_at, clicked_at, id,
           (status <> 'discovered' AND COALESCE(email, '') <> '') AS is_lead
    FROM prospects
    WHERE client_id = p_client_account_id AND campaign_id IS NULL
  ),
  days AS (SELECT generate_series(win_start, win_end_excl - 1, interval '1 day')::date AS day),
  daily AS (
    SELECT dy.day,
      count(*) FILTER (WHERE p.is_lead AND (p.created_at AT TIME ZONE 'utc')::date = dy.day) AS leads,
      count(*) FILTER (WHERE p.id = ANY(human) AND (p.opened_at AT TIME ZONE 'utc')::date = dy.day) AS opens,
      count(*) FILTER (WHERE (p.clicked_at AT TIME ZONE 'utc')::date = dy.day) AS clicks
    FROM days dy LEFT JOIN p ON true
    GROUP BY dy.day
  ),
  tot AS (
    SELECT
      count(*) FILTER (WHERE is_lead AND created_at >= win_start AND created_at < win_end_excl) AS c_leads,
      count(*) FILTER (WHERE id = ANY(human) AND opened_at >= win_start AND opened_at < win_end_excl) AS c_opens,
      count(*) FILTER (WHERE clicked_at >= win_start AND clicked_at < win_end_excl) AS c_clicks,
      count(*) FILTER (WHERE is_lead AND created_at >= prev_start AND created_at < win_start) AS p_leads,
      count(*) FILTER (WHERE id = ANY(human) AND opened_at >= prev_start AND opened_at < win_start) AS p_opens,
      count(*) FILTER (WHERE clicked_at >= prev_start AND clicked_at < win_start) AS p_clicks
    FROM p
  )
  SELECT jsonb_build_object(
    'days', d,
    'current', jsonb_build_object('leads', c_leads, 'opens', c_opens, 'clicks', c_clicks),
    'previous', jsonb_build_object('leads', p_leads, 'opens', p_opens, 'clicks', p_clicks),
    'daily', (SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day, 'leads', leads, 'opens', opens, 'clicks', clicks) ORDER BY day), '[]'::jsonb) FROM daily)
  ) INTO result
  FROM tot;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.client_analytics_overview(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_analytics_overview(uuid, integer) TO authenticated;
