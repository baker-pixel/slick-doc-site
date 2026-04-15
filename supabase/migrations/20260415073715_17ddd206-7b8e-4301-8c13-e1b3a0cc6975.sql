UPDATE public.sop_documents SET tier = 'transformation' WHERE tier IN ('scale', 'dominate');
ALTER TABLE public.sop_documents ADD CONSTRAINT sop_documents_tier_check CHECK (tier IN ('foundation', 'growth', 'transformation'));

CREATE OR REPLACE FUNCTION public.generate_tasks_for_client(p_client_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client RECORD;
  v_template RECORD;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_client FROM client_accounts WHERE id = p_client_id;
  IF v_client IS NULL THEN RAISE EXCEPTION 'Client not found'; END IF;
  FOR v_template IN SELECT * FROM task_templates WHERE tier = v_client.tier AND is_active = true ORDER BY order_index
  LOOP
    INSERT INTO client_tasks (client_account_id, task_template_id, name, description, instructions, category, automation_type, order_index, status)
    VALUES (p_client_id, v_template.id, v_template.name, v_template.description, v_template.instructions, v_template.category, v_template.automation_type, v_template.order_index, 'pending');
    v_count := v_count + 1;
  END LOOP;
  INSERT INTO client_onboarding (client_account_id) VALUES (p_client_id) ON CONFLICT (client_account_id) DO NOTHING;
  INSERT INTO kpi_dashboards (client_account_id, config) VALUES (p_client_id,
    CASE v_client.tier
      WHEN 'foundation' THEN '{"widgets":["traffic_overview","gbp_calls","form_submissions","reviews"]}'::jsonb
      WHEN 'growth' THEN '{"widgets":["traffic_overview","gbp_calls","form_submissions","reviews","lead_sources","email_performance","ad_performance"]}'::jsonb
      WHEN 'transformation' THEN '{"widgets":["traffic_overview","gbp_calls","form_submissions","reviews","lead_sources","email_performance","ad_performance","funnel_metrics","seo_visibility","retention","revenue_attribution"]}'::jsonb
      ELSE '{"widgets":["traffic_overview","gbp_calls","form_submissions","reviews"]}'::jsonb
    END) ON CONFLICT (client_account_id) DO NOTHING;
  INSERT INTO reporting_schedules (client_account_id, report_type, frequency, recipients)
  VALUES (p_client_id, 'performance', CASE v_client.tier WHEN 'foundation' THEN 'monthly' WHEN 'growth' THEN 'monthly' ELSE 'weekly' END, ARRAY[v_client.email]);
  RETURN v_count;
END;
$function$;