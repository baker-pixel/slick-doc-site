-- Removes the tool-calling agent loop (run-agent) and its tables: 1 test
-- run ever, no cron dependency, and every automation it wrapped is already
-- reachable via the per-client workflow task UI (TaskExecutionModal).
drop table if exists public.agent_pending_actions;
drop table if exists public.agent_traces;
