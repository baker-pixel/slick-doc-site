-- Add token for resume links on gap analysis
ALTER TABLE public.gap_analysis_submissions 
ADD COLUMN IF NOT EXISTS resume_token uuid DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS is_partial boolean DEFAULT false;

-- Allow reading partial submissions by resume token
CREATE POLICY "Anyone can view their submission by resume token" 
ON public.gap_analysis_submissions 
FOR SELECT 
USING (resume_token IS NOT NULL);