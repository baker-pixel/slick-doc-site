-- SECURITY DEFINER RPC so the admin UI can create a workflow task without needing
-- a direct INSERT policy on workflow_tasks (avoids RLS/JWT headaches on the frontend).
CREATE OR REPLACE FUNCTION public.create_seo_audit_task(p_client_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid;
BEGIN
  INSERT INTO public.workflow_tasks (client_id, task_type, status, audit_scope, payload)
  VALUES (
    p_client_id,
    'seo',
    'pending',
    'full',
    '{"audit_scope": "full", "analysis_type": "full_site_audit"}'::jsonb
  )
  RETURNING id INTO v_task_id;
  RETURN v_task_id;
END;
$$;

-- Grant execute to authenticated users (admin panel users)
GRANT EXECUTE ON FUNCTION public.create_seo_audit_task(uuid) TO authenticated;
