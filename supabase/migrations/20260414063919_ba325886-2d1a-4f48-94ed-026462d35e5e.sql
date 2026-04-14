ALTER TABLE public.content_calendar
ADD COLUMN IF NOT EXISTS client_approved boolean NOT NULL DEFAULT false;