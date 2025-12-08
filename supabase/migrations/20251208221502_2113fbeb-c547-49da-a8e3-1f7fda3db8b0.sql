-- Enable realtime for client portal tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_milestones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.content_approvals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_analytics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_invoices;