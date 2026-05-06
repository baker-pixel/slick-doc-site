-- Auto-recalculate project progress_percentage when milestone statuses change.
-- This replaces manual slider input as the source of truth.

CREATE OR REPLACE FUNCTION update_project_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_project_id uuid;
  total_count   integer;
  completed_count integer;
  new_progress  integer;
BEGIN
  v_project_id := COALESCE(NEW.project_id, OLD.project_id);

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO total_count, completed_count
  FROM project_milestones
  WHERE project_id = v_project_id;

  new_progress := CASE
    WHEN total_count > 0 THEN ROUND((completed_count::decimal / total_count) * 100)
    ELSE 0
  END;

  UPDATE client_projects
  SET
    progress_percentage = new_progress,
    updated_at          = NOW()
  WHERE id = v_project_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_project_progress ON project_milestones;

CREATE TRIGGER trigger_update_project_progress
  AFTER INSERT OR UPDATE OF status OR DELETE
  ON project_milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_project_progress();
