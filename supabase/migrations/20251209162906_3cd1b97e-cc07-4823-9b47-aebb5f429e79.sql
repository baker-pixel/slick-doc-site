-- Trigger function for client messages
CREATE OR REPLACE FUNCTION public.trigger_log_message_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_client_activity(
      NEW.client_account_id,
      'message_created',
      'New message received',
      CASE 
        WHEN NEW.sender_type = 'client' THEN 'Client sent a message'
        ELSE 'Team sent a message'
      END,
      jsonb_build_object('message_id', NEW.id, 'sender_type', NEW.sender_type),
      'message-circle'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger function for client meetings
CREATE OR REPLACE FUNCTION public.trigger_log_meeting_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_client_activity(
      NEW.client_account_id,
      'meeting_scheduled',
      'Meeting scheduled: ' || NEW.title,
      'A ' || NEW.meeting_type || ' meeting has been scheduled',
      jsonb_build_object('meeting_id', NEW.id, 'meeting_type', NEW.meeting_type, 'scheduled_at', NEW.scheduled_at),
      'calendar'
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    PERFORM log_client_activity(
      NEW.client_account_id,
      'meeting_updated',
      'Meeting status updated: ' || NEW.title,
      'Meeting status changed to ' || NEW.status,
      jsonb_build_object('meeting_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status),
      'calendar-check'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger function for client requests
CREATE OR REPLACE FUNCTION public.trigger_log_request_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_client_activity(
      NEW.client_account_id,
      'request_submitted',
      'New request: ' || NEW.title,
      NEW.request_type || ' request submitted',
      jsonb_build_object('request_id', NEW.id, 'request_type', NEW.request_type, 'priority', NEW.priority),
      'clipboard-list'
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    PERFORM log_client_activity(
      NEW.client_account_id,
      'request_updated',
      'Request updated: ' || NEW.title,
      'Request status changed to ' || NEW.status,
      jsonb_build_object('request_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status),
      'clipboard-check'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger function for deliverables
CREATE OR REPLACE FUNCTION public.trigger_log_deliverable_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_client_activity(
      NEW.client_account_id,
      'deliverable_submitted',
      'New deliverable: ' || NEW.title,
      NEW.category || ' deliverable submitted for review',
      jsonb_build_object('deliverable_id', NEW.id, 'category', NEW.category),
      'file-check'
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    PERFORM log_client_activity(
      NEW.client_account_id,
      'deliverable_updated',
      'Deliverable updated: ' || NEW.title,
      'Deliverable status changed to ' || NEW.status,
      jsonb_build_object('deliverable_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status),
      CASE NEW.status 
        WHEN 'approved' THEN 'check-circle'
        WHEN 'revision_requested' THEN 'edit'
        ELSE 'file-check'
      END
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Create the triggers
CREATE TRIGGER log_message_activity
  AFTER INSERT ON public.client_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_log_message_activity();

CREATE TRIGGER log_meeting_activity
  AFTER INSERT OR UPDATE ON public.client_meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_log_meeting_activity();

CREATE TRIGGER log_request_activity
  AFTER INSERT OR UPDATE ON public.client_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_log_request_activity();

CREATE TRIGGER log_deliverable_activity
  AFTER INSERT OR UPDATE ON public.deliverables
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_log_deliverable_activity();