-- Paid-tier "AI visibility score" -- does ChatGPT/Claude actually cite this
-- client when asked a real category+location question. Distinct from the
-- free ai_readiness_scores heuristic (schema/llms.txt/crawlability, every
-- report gets it); this one live-probes real LLMs and costs real API money,
-- gated to growth/transformation clients via tierPolicy().aiVisibility.

CREATE TABLE IF NOT EXISTS public.ai_visibility_prompts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  prompt_text  TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_visibility_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on ai_visibility_prompts"
  ON public.ai_visibility_prompts USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_visibility_prompts_client_text
  ON public.ai_visibility_prompts (client_id, prompt_text);

CREATE TABLE IF NOT EXISTS public.ai_visibility_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  prompt_id         UUID NOT NULL REFERENCES public.ai_visibility_prompts(id) ON DELETE CASCADE,
  model             TEXT NOT NULL CHECK (model IN ('gpt', 'claude')),
  mentioned         BOOLEAN NOT NULL,
  position          INTEGER, -- 1-indexed rank in the model's numbered list, when parseable
  response_excerpt  TEXT,    -- short snippet for admin review/debugging, not the full response
  run_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_visibility_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on ai_visibility_runs"
  ON public.ai_visibility_runs USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ai_visibility_runs_client ON public.ai_visibility_runs (client_id, run_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_visibility_scores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  total_score    INTEGER NOT NULL CHECK (total_score BETWEEN 0 AND 100),
  mention_rate   NUMERIC NOT NULL, -- fraction of (prompt x model) runs where mentioned, 0-1
  avg_position   NUMERIC,          -- average rank among runs with a parseable position
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_visibility_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on ai_visibility_scores"
  ON public.ai_visibility_scores USING (true) WITH CHECK (true);

-- One current rollup per client -- recomputing upserts, same reasoning as
-- ai_readiness_scores (see feedback_supabase_upsert_partial_index memory):
-- a plain UNIQUE constraint, never a partial index, so supabase-js .upsert()
-- can actually target it.
ALTER TABLE public.ai_visibility_scores
  ADD CONSTRAINT ai_visibility_scores_client_id_key UNIQUE (client_id);

-- Monthly probe run -- 1st of the month, 06:00 UTC. Same cron pattern as
-- auto-discover-prospects (net.http_post + public.get_anon_key()).
DO $$ BEGIN PERFORM cron.unschedule('run-ai-visibility-probes'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'run-ai-visibility-probes',
  '0 6 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/run-ai-visibility-probes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);
