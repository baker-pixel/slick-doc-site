-- Create table for tier interest submissions
CREATE TABLE public.tier_interest_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  business_name TEXT NOT NULL,
  selected_tier TEXT NOT NULL,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  contacted_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'new'
);

-- Enable RLS
ALTER TABLE public.tier_interest_submissions ENABLE ROW LEVEL SECURITY;

-- Allow public inserts (for unauthenticated form submissions)
CREATE POLICY "Anyone can submit tier interest" 
ON public.tier_interest_submissions 
FOR INSERT 
WITH CHECK (true);

-- Only admins can view submissions
CREATE POLICY "Admins can view all tier interest submissions" 
ON public.tier_interest_submissions 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));