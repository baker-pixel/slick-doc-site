-- Steward foundation: durable state for per-client, per-engine agents, and the
-- token table for the MCP server that exposes them.
--
-- agent_runs stays what it is (one row per LLM call, for spend and debugging).
-- A steward "run" spans many LLM calls and many tool calls, so it gets its own
-- table. All writes come from edge functions using the service role; the only
-- policies below are admin read access for the admin panel. mcp_tokens has no
-- policies at all (service role only).

-- ── Per client x engine switches ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.steward_settings (
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  engine text NOT NULL CHECK (engine IN ('seo', 'social', 'prospect', 'reporting')),
  enabled boolean NOT NULL DEFAULT false,
  autonomy text NOT NULL DEFAULT 'shadow'
    CHECK (autonomy IN ('shadow', 'propose', 'auto_internal', 'auto_publish')),
  daily_token_budget integer NOT NULL DEFAULT 200000 CHECK (daily_token_budget >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_account_id, engine)
);

-- ── Goals ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  engine text NOT NULL CHECK (engine IN ('seo', 'social', 'prospect', 'reporting')),
  objective text NOT NULL,
  -- outcome_metrics.metric this goal is measured by, when one exists
  metric text,
  baseline_value numeric,
  target_value numeric,
  due_date date,
  project_id uuid REFERENCES public.client_projects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'paused', 'dropped')),
  created_by text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_goals_client_status_idx ON public.client_goals (client_account_id, status);

-- ── Runs: one wake of one steward, resumable across invocations ──────────────
CREATE TABLE IF NOT EXISTS public.steward_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  engine text NOT NULL CHECK (engine IN ('seo', 'social', 'prospect', 'reporting', 'supervisor')),
  -- Idempotency key, e.g. 'seo:<client>:2026-10-30T09'. A real UNIQUE column so upsert/onConflict works.
  slot_key text NOT NULL UNIQUE,
  trigger text NOT NULL CHECK (trigger IN ('heartbeat', 'event', 'manual', 'mcp')),
  autonomy text NOT NULL DEFAULT 'shadow'
    CHECK (autonomy IN ('shadow', 'propose', 'auto_internal', 'auto_publish')),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'waiting', 'completed', 'failed', 'stopped')),
  -- Checkpoint: enough to resume the loop on the next wake.
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  step_count integer NOT NULL DEFAULT 0,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  summary text,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS steward_runs_client_started_idx ON public.steward_runs (client_account_id, started_at DESC);
CREATE INDEX IF NOT EXISTS steward_runs_open_idx ON public.steward_runs (status) WHERE status IN ('running', 'waiting');

-- ── Memory: decisions, observations and distilled lessons ────────────────────
CREATE TABLE IF NOT EXISTS public.agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  engine text CHECK (engine IN ('seo', 'social', 'prospect', 'reporting', 'supervisor')),
  run_id uuid REFERENCES public.steward_runs(id) ON DELETE SET NULL,
  goal_id uuid REFERENCES public.client_goals(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('decision', 'observation', 'lesson')),
  content text NOT NULL,
  rationale text,
  -- What happened after the decision, filled in later by the reflect step.
  outcome jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_memory_client_kind_idx ON public.agent_memory (client_account_id, kind, created_at DESC);

-- ── Proposals: the approval queue ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  engine text NOT NULL CHECK (engine IN ('seo', 'social', 'prospect', 'reporting', 'supervisor')),
  run_id uuid REFERENCES public.steward_runs(id) ON DELETE SET NULL,
  goal_id uuid REFERENCES public.client_goals(id) ON DELETE SET NULL,
  tool text NOT NULL,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text NOT NULL,
  rationale text,
  side_effect text NOT NULL CHECK (side_effect IN ('internal', 'external')),
  status text NOT NULL DEFAULT 'pending'
    -- 'shadow' = recorded by a steward in shadow mode: visible for evaluation, never actionable.
    CHECK (status IN ('shadow', 'pending', 'approved', 'rejected', 'executed', 'failed', 'expired')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_proposals_pending_idx ON public.agent_proposals (created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS agent_proposals_client_idx ON public.agent_proposals (client_account_id, created_at DESC);

-- ── Requests between engines (the blackboard) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  from_engine text NOT NULL CHECK (from_engine IN ('seo', 'social', 'prospect', 'reporting', 'supervisor')),
  to_engine text NOT NULL CHECK (to_engine IN ('seo', 'social', 'prospect', 'reporting')),
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'done', 'dismissed')),
  claimed_by_run uuid REFERENCES public.steward_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS agent_requests_open_idx ON public.agent_requests (to_engine, created_at) WHERE status = 'open';

-- ── MCP access tokens ────────────────────────────────────────────────────────
-- Only a SHA-256 hash is stored; the plaintext token is shown once at creation.
CREATE TABLE IF NOT EXISTS public.mcp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  -- 'read' (default), 'propose' (create goals/proposals), 'decide' (approve/reject proposals)
  scopes text[] NOT NULL DEFAULT ARRAY['read']::text[],
  -- NULL = every client; otherwise the token can only see these clients.
  client_account_ids uuid[],
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_tokens_user_idx ON public.mcp_tokens (user_id);

-- ── RLS: locked by default, admin read for the admin panel ───────────────────
ALTER TABLE public.steward_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steward_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.steward_settings, public.client_goals, public.steward_runs, public.agent_memory,
  public.agent_proposals, public.agent_requests, public.mcp_tokens FROM anon;

CREATE POLICY "Admin role can read steward_settings"
  ON public.steward_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin role can read client_goals"
  ON public.client_goals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin role can read steward_runs"
  ON public.steward_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin role can read agent_memory"
  ON public.agent_memory FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin role can read agent_proposals"
  ON public.agent_proposals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin role can read agent_requests"
  ON public.agent_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
