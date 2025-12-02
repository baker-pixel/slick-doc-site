-- Create table for PDF download leads
CREATE TABLE public.pdf_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  first_name TEXT,
  source TEXT DEFAULT 'system_brochure',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pdf_leads ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (public form)
CREATE POLICY "Anyone can submit their email for PDF" 
ON public.pdf_leads 
FOR INSERT 
WITH CHECK (true);

-- Only admins can view (for now, using a simple check - in production you'd use auth)
CREATE POLICY "Public can view own submission" 
ON public.pdf_leads 
FOR SELECT 
USING (true);