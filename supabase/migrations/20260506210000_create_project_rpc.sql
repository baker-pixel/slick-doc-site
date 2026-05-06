-- Atomic RPC: creates a project + its milestones in a single transaction.
-- Both the ProjectSetupWizard and any other caller use this instead of
-- two separate DB calls that can leave orphaned projects if the second fails.

CREATE OR REPLACE FUNCTION public.create_project_with_milestones(
  p_client_account_id uuid,
  p_name               text,
  p_description        text    DEFAULT NULL,
  p_start_date         date    DEFAULT CURRENT_DATE,
  p_target_end_date    date    DEFAULT NULL,
  p_milestones         jsonb   DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_project_id      uuid;
  v_milestone       jsonb;
  v_sort_order      int := 0;
  v_days_offset     int;
  v_due_date        date;
BEGIN
  -- Insert project
  INSERT INTO client_projects (
    client_account_id,
    name,
    description,
    status,
    start_date,
    target_end_date,
    progress_percentage
  ) VALUES (
    p_client_account_id,
    p_name,
    p_description,
    'in_progress',
    p_start_date,
    p_target_end_date,
    0
  )
  RETURNING id INTO v_project_id;

  -- Insert milestones (same transaction — any failure rolls back the project too)
  FOR v_milestone IN SELECT * FROM jsonb_array_elements(p_milestones)
  LOOP
    v_days_offset := COALESCE((v_milestone->>'days_from_start')::int, (v_sort_order + 1) * 7);
    v_due_date    := p_start_date + v_days_offset;

    INSERT INTO project_milestones (
      project_id,
      name,
      description,
      status,
      due_date,
      sort_order
    ) VALUES (
      v_project_id,
      v_milestone->>'name',
      NULLIF(v_milestone->>'description', ''),
      'pending',
      v_due_date,
      COALESCE((v_milestone->>'sort_order')::int, v_sort_order)
    );

    v_sort_order := v_sort_order + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'project_id',        v_project_id,
    'milestones_created', v_sort_order
  );
END;
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION public.create_project_with_milestones TO authenticated, service_role;
