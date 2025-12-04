-- Create email_preferences table for managing subscriptions
CREATE TABLE public.email_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  subscribed BOOLEAN NOT NULL DEFAULT true,
  unsubscribed_at TIMESTAMP WITH TIME ZONE,
  unsubscribe_reason TEXT,
  preferences JSONB DEFAULT '{"marketing": true, "transactional": true, "sequences": true}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

-- Allow anyone to view/update their own preferences by email
CREATE POLICY "Anyone can view preferences by email" 
ON public.email_preferences 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert preferences" 
ON public.email_preferences 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update preferences" 
ON public.email_preferences 
FOR UPDATE 
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_email_preferences_updated_at
BEFORE UPDATE ON public.email_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_email_preferences_email ON public.email_preferences(email);
CREATE INDEX idx_email_preferences_subscribed ON public.email_preferences(subscribed);