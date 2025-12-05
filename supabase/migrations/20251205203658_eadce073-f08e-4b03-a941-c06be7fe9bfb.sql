-- Create content calendar table for scheduled posts
CREATE TABLE public.content_calendar (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID REFERENCES public.generated_content(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  platform TEXT, -- 'email', 'linkedin', 'facebook', 'twitter', 'blog'
  status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'published', 'failed'
  published_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.content_calendar ENABLE ROW LEVEL SECURITY;

-- Admin full access policy
CREATE POLICY "Admin full access to content_calendar" 
ON public.content_calendar 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_content_calendar_updated_at
BEFORE UPDATE ON public.content_calendar
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();