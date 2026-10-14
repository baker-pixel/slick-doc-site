-- AI Spend & Budget: what the platform costs to run, in dollars.
--
-- Token counts are recorded on every successful AI call (agent_runs), but the
-- price per token lives nowhere in the database, so cost has to come from a rate
-- card. Providers change prices (and retire models), so the card is editable
-- from the admin page and every seeded rate is marked unverified until the owner
-- confirms it against an invoice. Anything with no price is shown as "not
-- priced" rather than silently counted as $0.
--
-- Service-role only: reached through the admin-ai-spend edge function.

CREATE TABLE IF NOT EXISTS public.ai_rate_card (
  key text PRIMARY KEY,                      -- model name (tokens) or usage key (unit)
  kind text NOT NULL CHECK (kind IN ('tokens', 'unit')),
  provider text NOT NULL,
  label text NOT NULL,
  input_per_mtok numeric CHECK (input_per_mtok IS NULL OR input_per_mtok >= 0),   -- USD per 1M input tokens
  output_per_mtok numeric CHECK (output_per_mtok IS NULL OR output_per_mtok >= 0), -- USD per 1M output tokens
  unit_cost numeric CHECK (unit_cost IS NULL OR unit_cost >= 0),                  -- USD per image / lookup / call
  note text,
  verified boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_rate_card ENABLE ROW LEVEL SECURITY; -- no policies: service role only

-- Starting estimates from the providers' public price lists. Unverified on purpose.
INSERT INTO public.ai_rate_card (key, kind, provider, label, input_per_mtok, output_per_mtok, note) VALUES
  ('gpt-4.1-mini',           'tokens', 'OpenAI', 'GPT-4.1 mini',            0.40, 1.60, 'Main writing/extraction model'),
  ('gpt-4o-mini',            'tokens', 'OpenAI', 'GPT-4o mini',             0.15, 0.60, 'Cheap model for quality checks and classification'),
  ('openai/gpt-oss-120b',    'tokens', 'Groq',   'GPT-OSS 120B (via Groq)', 0.15, 0.75, 'Backup used when the main model is unavailable'),
  ('openai/gpt-oss-20b',     'tokens', 'Groq',   'GPT-OSS 20B (via Groq)',  0.10, 0.50, 'Backup for the cheap model'),
  ('llama-3.3-70b-versatile','tokens', 'Groq',   'Llama 3.3 70B (retired)', 0.59, 0.79, 'Retired on Groq in Aug 2026; historical usage only'),
  ('llama-3.1-8b-instant',   'tokens', 'Groq',   'Llama 3.1 8B (retired)',  0.05, 0.08, 'Retired on Groq in Aug 2026; historical usage only')
ON CONFLICT (key) DO NOTHING;

-- Per-unit costs we cannot know without the owner: left blank, shown as "not priced".
INSERT INTO public.ai_rate_card (key, kind, provider, label, unit_cost, note) VALUES
  ('image_gpt_image_2',   'unit', 'OpenAI', 'Social images (gpt-image-2)',  NULL, 'Cost per generated image. Depends on quality/size; enter your average from the OpenAI invoice.'),
  ('apollo_email_lookup', 'unit', 'Apollo', 'Verified email lookups',        NULL, 'Cost per email revealed. Depends on your Apollo plan.'),
  ('maps_call',           'unit', 'Google', 'Google Maps searches',          NULL, 'Cost per place found.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ai_spend_usage()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH bounds AS (SELECT date_trunc('month', now()) - interval '2 months' AS since)
  SELECT jsonb_build_object(
    'generated_at', now(),

    -- Daily AI calls by model, task and client. Failed calls carry no token counts.
    'usage', coalesce((
      SELECT jsonb_agg(to_jsonb(u)) FROM (
        SELECT (a.created_at AT TIME ZONE 'utc')::date AS day, coalesce(a.model, 'unknown') AS model,
               coalesce(a.source, 'unknown') AS source, a.client_id,
               count(*) AS calls, count(*) FILTER (WHERE a.status <> 'ok') AS failed,
               coalesce(sum(a.prompt_tokens), 0) AS prompt_tokens, coalesce(sum(a.completion_tokens), 0) AS completion_tokens
        FROM agent_runs a, bounds b
        WHERE a.created_at >= b.since
        GROUP BY 1, 2, 3, 4
      ) u
    ), '[]'::jsonb),

    -- Images are not in agent_runs; every generated image is stored as a file.
    'images', coalesce((
      SELECT jsonb_agg(jsonb_build_object('day', i.day, 'n', i.n)) FROM (
        SELECT (o.created_at AT TIME ZONE 'utc')::date AS day, count(*) AS n
        FROM storage.objects o, bounds b
        WHERE o.bucket_id = 'generated-images' AND o.created_at >= b.since
        GROUP BY 1
      ) i
    ), '[]'::jsonb),

    -- Other paid lookups we log as usage.
    'units', coalesce((
      SELECT jsonb_agg(jsonb_build_object('day', x.day, 'unit', x.unit, 'n', x.n)) FROM (
        SELECT (c.created_at AT TIME ZONE 'utc')::date AS day,
               CASE WHEN c.event_type = 'maps_api_call' THEN 'maps_call'
                    WHEN c.metadata->>'kind' = 'apollo_email_lookup' THEN 'apollo_email_lookup'
                    ELSE NULL END AS unit,
               coalesce(sum(c.units), 0) AS n
        FROM client_usage c, bounds b
        WHERE c.created_at >= b.since AND c.event_type IN ('prospect_research', 'maps_api_call')
        GROUP BY 1, 2
      ) x WHERE x.unit IS NOT NULL
    ), '[]'::jsonb),

    'rates', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.kind, r.key) FROM ai_rate_card r), '[]'::jsonb),
    'budget', (SELECT value FROM admin_settings WHERE key = 'ai_monthly_budget_usd'),
    'clients', coalesce((SELECT jsonb_agg(jsonb_build_object('id', ca.id, 'name', ca.business_name, 'tier', ca.tier, 'status', ca.status) ORDER BY ca.business_name) FROM client_accounts ca), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.ai_spend_usage() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_spend_usage() TO service_role;
