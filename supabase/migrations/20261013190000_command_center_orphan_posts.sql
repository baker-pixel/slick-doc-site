-- Command Center: posts queued for a social network the client has no connected
-- account on. They cannot publish ("No PfM account for linkedin"), so flag them
-- before the due date instead of after the failure. Returns
-- { "<client_id>": { "<platform>": <upcoming post count> } }.
CREATE OR REPLACE FUNCTION public.command_center_orphan_posts()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_object_agg(t.client_id, t.platforms), '{}'::jsonb)
  FROM (
    SELECT o.client_account_id AS client_id, jsonb_object_agg(o.platform, o.n) AS platforms
    FROM (
      SELECT c.client_account_id, c.platform, count(*) AS n
      FROM content_calendar c
      WHERE c.scheduled_for >= now()
        AND c.status IN ('draft', 'scheduled')
        AND c.platform IN ('facebook', 'instagram', 'linkedin', 'twitter')
        AND NOT EXISTS (
          SELECT 1 FROM client_postforme_accounts x
          WHERE x.client_id = c.client_account_id AND x.platform = c.platform AND x.status = 'connected'
        )
      GROUP BY c.client_account_id, c.platform
    ) o
    GROUP BY o.client_account_id
  ) t;
$$;
REVOKE ALL ON FUNCTION public.command_center_orphan_posts() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.command_center_orphan_posts() TO service_role;
