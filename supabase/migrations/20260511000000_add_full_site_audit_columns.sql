-- Add full-site audit support columns to workflow_tasks
-- These are read by the realtime subscription in the admin UI for live progress
ALTER TABLE public.workflow_tasks ADD COLUMN IF NOT EXISTS audit_scope       text    DEFAULT 'single';
ALTER TABLE public.workflow_tasks ADD COLUMN IF NOT EXISTS progress_message  text;
ALTER TABLE public.workflow_tasks ADD COLUMN IF NOT EXISTS pages_crawled     integer DEFAULT 0;
