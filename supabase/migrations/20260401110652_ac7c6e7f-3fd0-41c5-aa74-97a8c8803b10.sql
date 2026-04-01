
ALTER TABLE public.content_approvals ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.content_approvals ADD COLUMN IF NOT EXISTS publish_triggered_at timestamptz;
ALTER TABLE public.content_approvals ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE public.content_approvals ADD COLUMN IF NOT EXISTS publish_status text DEFAULT 'pending';
