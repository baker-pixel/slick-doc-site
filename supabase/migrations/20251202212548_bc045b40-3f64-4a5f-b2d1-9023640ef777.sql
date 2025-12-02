-- Add column to store AI analysis for shareable reports
ALTER TABLE public.gap_analysis_submissions 
ADD COLUMN IF NOT EXISTS ai_analysis jsonb DEFAULT NULL;

-- Create a policy to allow public read access to completed reports
CREATE POLICY "Anyone can view completed reports by ID" 
ON public.gap_analysis_submissions 
FOR SELECT 
USING (status = 'submitted' AND completed_at IS NOT NULL);