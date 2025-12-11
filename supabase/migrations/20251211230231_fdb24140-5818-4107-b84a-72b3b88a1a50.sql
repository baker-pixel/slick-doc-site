-- Create client portal preferences table
CREATE TABLE public.client_portal_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  
  -- Visual preferences
  theme TEXT NOT NULL DEFAULT 'system',
  accent_color TEXT NOT NULL DEFAULT 'default',
  layout_density TEXT NOT NULL DEFAULT 'comfortable',
  
  -- Navigation preferences
  default_landing_page TEXT NOT NULL DEFAULT 'activity',
  hidden_tabs TEXT[] DEFAULT '{}',
  sidebar_order TEXT[] DEFAULT '{}',
  pinned_sections TEXT[] DEFAULT '{}',
  
  -- Notification preferences
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  notification_digest TEXT NOT NULL DEFAULT 'instant',
  notify_on_messages BOOLEAN NOT NULL DEFAULT true,
  notify_on_approvals BOOLEAN NOT NULL DEFAULT true,
  notify_on_deliverables BOOLEAN NOT NULL DEFAULT true,
  notify_on_invoices BOOLEAN NOT NULL DEFAULT true,
  notify_on_meetings BOOLEAN NOT NULL DEFAULT true,
  
  -- Dashboard widget preferences
  activity_widget_types TEXT[] DEFAULT ARRAY['messages', 'approvals', 'projects', 'deliverables'],
  show_analytics_summary BOOLEAN NOT NULL DEFAULT true,
  show_quick_actions BOOLEAN NOT NULL DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_portal_preferences ENABLE ROW LEVEL SECURITY;

-- Clients can view their own preferences
CREATE POLICY "Users can view their own preferences"
ON public.client_portal_preferences
FOR SELECT
USING (user_id = auth.uid());

-- Clients can insert their own preferences
CREATE POLICY "Users can insert their own preferences"
ON public.client_portal_preferences
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Clients can update their own preferences
CREATE POLICY "Users can update their own preferences"
ON public.client_portal_preferences
FOR UPDATE
USING (user_id = auth.uid());

-- Admins can manage all preferences
CREATE POLICY "Admins can manage all preferences"
ON public.client_portal_preferences
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_client_portal_preferences_updated_at
BEFORE UPDATE ON public.client_portal_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();