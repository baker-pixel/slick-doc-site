-- Security advisor: many SECURITY DEFINER functions in `public` were callable by
-- the anonymous (signed-out) role through /rest/v1/rpc/*. The original
-- migrations granted EXECUTE to authenticated/service_role but never revoked
-- Postgres's default EXECUTE-to-PUBLIC, so anon could call them too.
--
-- Worst offenders had NO caller check at all, so a signed-out visitor could:
--   * create projects + milestones for any client (create_project_with_milestones,
--     bootstrap_client_projects)
--   * forge entries in any client's activity feed (log_client_activity)
--   * queue a full-site SEO audit task, which costs real money (create_seo_audit_task)
--   * spam automation_alerts (report_failed_cron_http_calls)
--
-- Safe to revoke because every legitimate caller runs with its own privileges:
--   * DB triggers calling log_client_activity / get_anon_key are SECURITY DEFINER
--     (run as the owner), and pg_cron runs as postgres.
--   * Edge functions use the service role.
--   * Postgres does not check EXECUTE on a trigger function when the trigger
--     fires, so revoking it from API roles cannot break a trigger.
-- has_role() and get_optimal_send_hour() are left alone: RLS policies evaluate
-- has_role() as the querying role, so revoking it would break policies.

-- 1. Internal-only: service role (and the owner, via triggers/cron) only.
REVOKE EXECUTE ON FUNCTION public.bootstrap_client_projects(uuid, boolean)                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_client_activity(uuid, text, text, text, jsonb, text)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.report_failed_cron_http_calls()                                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_anon_key()                                                    FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.bootstrap_client_projects(uuid, boolean)                          TO service_role;
GRANT  EXECUTE ON FUNCTION public.log_client_activity(uuid, text, text, text, jsonb, text)          TO service_role;
GRANT  EXECUTE ON FUNCTION public.report_failed_cron_http_calls()                                   TO service_role;
GRANT  EXECUTE ON FUNCTION public.get_anon_key()                                                    TO service_role;

-- 2. Called by signed-in users: no anon, and check WHO inside the function.
--    (auth.uid() is NULL for the service role, so that path stays allowed.)
CREATE OR REPLACE FUNCTION public.create_project_with_milestones(
  p_client_account_id uuid,
  p_name              text,
  p_description       text DEFAULT NULL::text,
  p_start_date        date DEFAULT CURRENT_DATE,
  p_target_end_date   date DEFAULT NULL::date,
  p_milestones        jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id      uuid;
  v_milestone       jsonb;
  v_sort_order      int := 0;
  v_days_offset     int;
  v_due_date        date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO client_projects (
    client_account_id, name, description, status, start_date, target_end_date, progress_percentage
  ) VALUES (
    p_client_account_id, p_name, p_description, 'in_progress', p_start_date, p_target_end_date, 0
  )
  RETURNING id INTO v_project_id;

  -- Milestones in the same transaction: any failure rolls back the project too.
  FOR v_milestone IN SELECT * FROM jsonb_array_elements(p_milestones)
  LOOP
    v_days_offset := COALESCE((v_milestone->>'days_from_start')::int, (v_sort_order + 1) * 7);
    v_due_date    := p_start_date + v_days_offset;

    INSERT INTO project_milestones (project_id, name, description, status, due_date, sort_order)
    VALUES (
      v_project_id,
      v_milestone->>'name',
      NULLIF(v_milestone->>'description', ''),
      'pending',
      v_due_date,
      COALESCE((v_milestone->>'sort_order')::int, v_sort_order)
    );

    v_sort_order := v_sort_order + 1;
  END LOOP;

  RETURN jsonb_build_object('project_id', v_project_id, 'milestones_created', v_sort_order);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_seo_audit_task(p_client_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_task_id uuid;
BEGIN
  -- A signed-in caller must be an admin or belong to that client.
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT EXISTS (
       SELECT 1 FROM public.client_portal_users
       WHERE user_id = auth.uid() AND client_account_id = p_client_id
     ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO public.workflow_tasks (client_id, task_type, status, audit_scope, payload)
  VALUES (
    p_client_id, 'seo', 'pending', 'full',
    '{"audit_scope": "full", "analysis_type": "full_site_audit"}'::jsonb
  )
  RETURNING id INTO v_task_id;
  RETURN v_task_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_project_with_milestones(uuid, text, text, date, date, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_seo_audit_task(uuid)                                         FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_project_with_milestones(uuid, text, text, date, date, jsonb) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.create_seo_audit_task(uuid)                                         TO authenticated, service_role;

-- 3. Portal functions that already check auth.uid(): signed-out users have no
--    reason to reach them at all (defense in depth).
REVOKE EXECUTE ON FUNCTION public.client_get_outreach_sequence()                                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.client_get_prospect_emails(uuid, uuid)                               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.client_get_prospect_next_email(uuid, uuid)                           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.client_update_company_context(uuid, text, text, text, text, jsonb)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.client_update_icp(uuid, jsonb)                                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.client_update_outreach_settings(uuid, jsonb)                         FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.client_get_outreach_sequence()                                       TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.client_get_prospect_emails(uuid, uuid)                               TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.client_get_prospect_next_email(uuid, uuid)                           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.client_update_company_context(uuid, text, text, text, text, jsonb)   TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.client_update_icp(uuid, jsonb)                                       TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.client_update_outreach_settings(uuid, jsonb)                         TO authenticated, service_role;

-- 4. Trigger functions are never meant to be called via the API.
REVOKE EXECUTE ON FUNCTION public.protect_brand_asset_core_fields()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_workflow_step_actual_completion()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_gap_analysis_sequence()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_generate_gap_analysis()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_hot_lead_sequence()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_log_content_approval_activity()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_log_deliverable_activity()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_log_meeting_activity()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_log_message_activity()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_log_request_activity()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_new_lead_sequence()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_pdf_lead_sequence()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_welcome_sequence()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_contact_activity()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_project_progress()                   FROM PUBLIC, anon, authenticated;
