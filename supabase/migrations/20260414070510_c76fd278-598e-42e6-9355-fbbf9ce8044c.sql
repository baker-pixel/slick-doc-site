ALTER TABLE public.content_approvals
ADD COLUMN IF NOT EXISTS platform text,
ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

ALTER TABLE public.content_calendar
ADD COLUMN IF NOT EXISTS error_message text;