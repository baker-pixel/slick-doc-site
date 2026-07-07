-- Observability + approval-gate tables for the tool-calling agent loop
-- (run-agent). A trace is one full agent invocation for a client; each tool
-- call the agent makes during that run is appended to `steps`. Tools flagged
-- requires_approval don't execute inline -- they land in
-- agent_pending_actions for an admin to approve or reject.

create table if not exists public.agent_traces (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.client_accounts(id) on delete cascade,
  goal text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'stopped')),
  stop_reason text check (stop_reason in ('self_terminated', 'step_limit', 'time_limit', 'error')),
  steps jsonb not null default '[]'::jsonb,
  step_count int not null default 0,
  final_summary text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_traces_client_id on public.agent_traces(client_id);
create index if not exists idx_agent_traces_status on public.agent_traces(status);

create table if not exists public.agent_pending_actions (
  id uuid primary key default gen_random_uuid(),
  trace_id uuid not null references public.agent_traces(id) on delete cascade,
  client_id uuid references public.client_accounts(id) on delete cascade,
  tool_name text not null,
  tool_input jsonb not null default '{}'::jsonb,
  reasoning text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid,
  decided_at timestamptz,
  result jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_pending_actions_status on public.agent_pending_actions(status);
create index if not exists idx_agent_pending_actions_client_id on public.agent_pending_actions(client_id);

alter table public.agent_traces enable row level security;
alter table public.agent_pending_actions enable row level security;

create policy "Admins can manage agent_traces"
  on public.agent_traces for all
  using (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can manage agent_pending_actions"
  on public.agent_pending_actions for all
  using (has_role(auth.uid(), 'admin'::app_role));
