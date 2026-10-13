-- Admin view of every work cycle with the AI spend attributed to it.
-- agent_runs has no read policies (service role only), so this is a
-- SECURITY DEFINER function that checks the caller is an admin itself.
-- AI calls are attributed to a cycle by client + time window.
CREATE OR REPLACE FUNCTION public.admin_cycle_overview(p_limit int DEFAULT 100)
RETURNS TABLE (
  id uuid, client_account_id uuid, business_name text, cycle_no int,
  period_start timestamptz, period_end timestamptz, status text,
  trigger_source text, plan jsonb, digest jsonb, created_at timestamptz,
  ai_calls bigint, ai_failed bigint, ai_prompt_tokens bigint, ai_completion_tokens bigint,
  posts_total bigint, posts_tagged bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cy.id, cy.client_account_id, ca.business_name, cy.cycle_no,
         cy.period_start, cy.period_end, cy.status, cy.trigger_source,
         cy.plan, cy.digest, cy.created_at,
         coalesce(r.calls, 0), coalesce(r.failed, 0), coalesce(r.pt, 0), coalesce(r.ct, 0),
         (SELECT count(*) FROM content_calendar c WHERE c.client_account_id = cy.client_account_id
            AND c.scheduled_for >= cy.period_start AND c.scheduled_for < cy.period_end AND c.status <> 'failed'),
         (SELECT count(*) FROM content_calendar c WHERE c.cycle_id = cy.id)
  FROM client_cycles cy
  JOIN client_accounts ca ON ca.id = cy.client_account_id
  LEFT JOIN LATERAL (
    SELECT count(*) calls, count(*) FILTER (WHERE a.status <> 'ok') failed,
           sum(a.prompt_tokens) pt, sum(a.completion_tokens) ct
    FROM agent_runs a
    WHERE a.client_id = cy.client_account_id
      AND a.created_at >= cy.created_at AND a.created_at < least(coalesce(cy.digest->>'computed_at', 'infinity')::timestamptz, cy.period_end)
  ) r ON true
  WHERE has_role((select auth.uid()), 'admin'::app_role)
  ORDER BY cy.created_at DESC
  LIMIT p_limit;
$$;
REVOKE ALL ON FUNCTION public.admin_cycle_overview(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_cycle_overview(int) TO authenticated;
