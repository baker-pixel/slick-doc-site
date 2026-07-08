-- Tracks OpenAI Batch API submissions for social-post image generation
-- (gpt-image-1 via /v1/images/generations). One row per batch job; each
-- content_calendar row included in a batch stamps its own
-- metadata.image_batch_id to correlate back to this table.
CREATE TABLE public.image_batch_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  openai_batch_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'validating', 'in_progress', 'finalizing', 'completed', 'failed', 'expired', 'cancelled')),
  input_file_id TEXT,
  output_file_id TEXT,
  error_file_id TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_image_batch_jobs_status ON public.image_batch_jobs(status) WHERE status NOT IN ('completed', 'failed', 'expired', 'cancelled');

ALTER TABLE public.image_batch_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "image_batch_jobs_select" ON public.image_batch_jobs
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "image_batch_jobs_insert" ON public.image_batch_jobs
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "image_batch_jobs_update" ON public.image_batch_jobs
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
