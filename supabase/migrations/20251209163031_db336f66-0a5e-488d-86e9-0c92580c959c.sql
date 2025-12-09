-- Trigger function for content approvals
CREATE OR REPLACE FUNCTION public.trigger_log_content_approval_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    PERFORM log_client_activity(
      NEW.client_account_id,
      CASE NEW.status
        WHEN 'approved' THEN 'content_approved'
        WHEN 'changes_requested' THEN 'content_revision_requested'
        ELSE 'content_reviewed'
      END,
      CASE NEW.status
        WHEN 'approved' THEN 'Content approved: ' || NEW.title
        WHEN 'changes_requested' THEN 'Revision requested: ' || NEW.title
        ELSE 'Content reviewed: ' || NEW.title
      END,
      CASE NEW.status
        WHEN 'approved' THEN 'Client approved the ' || NEW.content_type || ' content'
        WHEN 'changes_requested' THEN 'Client requested changes to the ' || NEW.content_type || ' content'
        ELSE 'Client reviewed the ' || NEW.content_type || ' content'
      END,
      jsonb_build_object(
        'content_approval_id', NEW.id, 
        'content_type', NEW.content_type, 
        'old_status', OLD.status, 
        'new_status', NEW.status,
        'has_feedback', NEW.feedback IS NOT NULL
      ),
      CASE NEW.status
        WHEN 'approved' THEN 'check-circle'
        WHEN 'changes_requested' THEN 'edit-3'
        ELSE 'file-text'
      END
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER log_content_approval_activity
  AFTER UPDATE ON public.content_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_log_content_approval_activity();