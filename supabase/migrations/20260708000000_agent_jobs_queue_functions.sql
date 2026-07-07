-- Phase 4: expose the agent_jobs pgmq queue to edge functions.
--
-- pgmq schema is not exposed via PostgREST and service_role has no USAGE
-- grant on it (verified: has_schema_privilege('service_role','pgmq','usage')
-- = false). These SECURITY DEFINER wrappers in `public` run with the
-- owning role's privileges, so they can call pgmq internally regardless of
-- the caller's grants, while still only being callable by service_role.

CREATE OR REPLACE FUNCTION public.agent_jobs_enqueue(msg jsonb)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pgmq.send('agent_jobs', msg);
$$;

CREATE OR REPLACE FUNCTION public.agent_jobs_read(vt integer, qty integer)
RETURNS TABLE (msg_id bigint, read_ct integer, enqueued_at timestamptz, message jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT msg_id, read_ct, enqueued_at, message FROM pgmq.read('agent_jobs', vt, qty);
$$;

CREATE OR REPLACE FUNCTION public.agent_jobs_delete(msg_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pgmq.delete('agent_jobs', msg_id);
$$;

-- Archive (not delete) so failed/dead-lettered jobs stay inspectable in
-- pgmq's archive table instead of vanishing.
CREATE OR REPLACE FUNCTION public.agent_jobs_archive(msg_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pgmq.archive('agent_jobs', msg_id);
$$;

REVOKE ALL ON FUNCTION public.agent_jobs_enqueue(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_jobs_read(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_jobs_delete(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_jobs_archive(bigint) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.agent_jobs_enqueue(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_jobs_read(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_jobs_delete(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_jobs_archive(bigint) TO service_role;
