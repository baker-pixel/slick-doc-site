-- Supabase advisor: SECURITY DEFINER functions with a mutable search_path can be
-- hijacked by objects in a schema earlier on the path. Pin them to public.
ALTER FUNCTION public.update_project_progress() SET search_path = public;
ALTER FUNCTION public.bootstrap_client_projects(uuid, boolean) SET search_path = public;
