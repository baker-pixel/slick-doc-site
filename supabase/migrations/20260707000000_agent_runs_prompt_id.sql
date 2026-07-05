-- Phase 3: prompt versioning for agent_runs. Lets us correlate a specific
-- prompt version with output quality / rejection rate over time, instead of
-- flying blind on which prompt produced which result.
ALTER TABLE public.agent_runs ADD COLUMN IF NOT EXISTS prompt_id text NULL;

CREATE INDEX IF NOT EXISTS agent_runs_prompt_id_idx ON public.agent_runs (prompt_id) WHERE prompt_id IS NOT NULL;
