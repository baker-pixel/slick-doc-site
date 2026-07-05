-- Phase 2: AI observability + durable job queue foundation.

-- ── agent_runs: every LLM call, logged ──────────────────────────────────────
-- Currently the system flies blind on AI cost/quality/latency. This table is
-- written by _shared/ai.ts on every callAI/callAIJson invocation.
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,               -- calling function / call site, e.g. "run-content-agent"
  client_id uuid NULL REFERENCES public.client_accounts(id) ON DELETE SET NULL,
  model text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'error')),
  attempt_count integer NOT NULL DEFAULT 1,
  fallback_used boolean NOT NULL DEFAULT false,
  latency_ms integer NULL,
  prompt_tokens integer NULL,
  completion_tokens integer NULL,
  error_message text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS agent_runs_client_id_idx ON public.agent_runs (client_id);
CREATE INDEX IF NOT EXISTS agent_runs_source_created_at_idx ON public.agent_runs (source, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_status_idx ON public.agent_runs (status) WHERE status = 'error';

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

-- Written only by edge functions via service role; no public policies.
-- Admins read via the `admin` function's service-role proxy (ALLOWED_TABLES).

-- ── pgmq: durable queue for agent/automation jobs ───────────────────────────
-- Replaces fire-and-forget `fetch(...).catch(log)` dispatch between
-- orchestration functions with an at-least-once, crash-safe queue.
CREATE EXTENSION IF NOT EXISTS pgmq;

SELECT pgmq.create('agent_jobs');

-- idempotency_key prevents duplicate side effects (e.g. duplicate
-- generated_content rows) if a job is retried or delivered twice.
CREATE TABLE IF NOT EXISTS public.agent_job_dedupe (
  idempotency_key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  result jsonb NULL
);

ALTER TABLE public.agent_job_dedupe ENABLE ROW LEVEL SECURITY;

-- Cleanup old dedupe rows so the table doesn't grow unbounded (7 day window
-- comfortably covers any retry/backoff horizon in the system).
SELECT cron.schedule(
  'cleanup-agent-job-dedupe',
  '0 3 * * *',
  $$ DELETE FROM public.agent_job_dedupe WHERE created_at < now() - interval '7 days'; $$
);
