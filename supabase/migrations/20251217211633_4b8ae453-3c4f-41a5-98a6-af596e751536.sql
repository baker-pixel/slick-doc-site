-- Create project_comments table for client-team communication on projects
CREATE TABLE public.project_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.client_projects(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES public.project_milestones(id) ON DELETE CASCADE,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  user_id UUID,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('client', 'admin')),
  sender_name TEXT,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage all project comments" 
ON public.project_comments 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their project comments" 
ON public.project_comments 
FOR SELECT 
USING (client_account_id IN (
  SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
));

CREATE POLICY "Clients can create comments on their projects" 
ON public.project_comments 
FOR INSERT 
WITH CHECK (
  sender_type = 'client' AND
  client_account_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  )
);

-- Create project_update_requests table
CREATE TABLE public.project_update_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.client_projects(id) ON DELETE CASCADE,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  requested_by UUID,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'responded')),
  response TEXT,
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_update_requests ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage all update requests" 
ON public.project_update_requests 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their update requests" 
ON public.project_update_requests 
FOR SELECT 
USING (client_account_id IN (
  SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
));

CREATE POLICY "Clients can create update requests" 
ON public.project_update_requests 
FOR INSERT 
WITH CHECK (
  client_account_id IN (
    SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
  )
);

-- Add indexes
CREATE INDEX idx_project_comments_project ON public.project_comments(project_id);
CREATE INDEX idx_project_comments_milestone ON public.project_comments(milestone_id);
CREATE INDEX idx_project_update_requests_project ON public.project_update_requests(project_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_update_requests;