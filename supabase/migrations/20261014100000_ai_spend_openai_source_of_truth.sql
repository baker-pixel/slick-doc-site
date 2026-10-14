-- AI spend: OpenAI is the source of truth for dollars.
--
-- The first version priced tokens and images itself from an editable rate card
-- (ai_rate_card / ai_spend_usage()). That was an estimate that drifted from the
-- real bill (images alone were ~78% of it and unpriced). Dollars now come
-- straight from OpenAI's Costs API, so the rate card and its function are removed.
--
-- What stays local is ATTRIBUTION: OpenAI cannot say which of our tasks or clients
-- caused a charge, so we keep our own usage counts (requests and tokens, no money)
-- per day / model / task / client. Service-role only (admin-ai-spend edge function).

-- Last good answer from OpenAI, so the page still shows numbers during an OpenAI outage.
CREATE TABLE IF NOT EXISTS public.ai_spend_cache (
  key text PRIMARY KEY,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_spend_cache ENABLE ROW LEVEL SECURITY; -- no policies: service role only

CREATE OR REPLACE FUNCTION public.ai_usage_attribution()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'usage', coalesce((
      SELECT jsonb_agg(to_jsonb(u)) FROM (
        SELECT (a.created_at AT TIME ZONE 'utc')::date AS day, coalesce(a.model, 'unknown') AS model,
               coalesce(a.source, 'unknown') AS source, a.client_id,
               count(*) AS calls, count(*) FILTER (WHERE a.status <> 'ok') AS failed,
               coalesce(sum(a.prompt_tokens), 0) AS prompt_tokens, coalesce(sum(a.completion_tokens), 0) AS completion_tokens
        FROM agent_runs a
        WHERE a.created_at >= date_trunc('month', now()) - interval '1 month'
        GROUP BY 1, 2, 3, 4
      ) u
    ), '[]'::jsonb),
    'budget', (SELECT value FROM admin_settings WHERE key = 'ai_monthly_budget_usd'),
    'clients', coalesce((SELECT jsonb_agg(jsonb_build_object('id', ca.id, 'name', ca.business_name, 'tier', ca.tier, 'status', ca.status) ORDER BY ca.business_name) FROM client_accounts ca), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.ai_usage_attribution() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_attribution() TO service_role;

-- Remove the price-estimate approach.
DROP FUNCTION IF EXISTS public.ai_spend_usage();
DROP TABLE IF EXISTS public.ai_rate_card;
