-- Learning Hub content table
CREATE TABLE public.learning_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  content_type TEXT NOT NULL DEFAULT 'article', -- article, video, tip, guide
  content_url TEXT,
  content_body TEXT,
  thumbnail_url TEXT,
  industry TEXT, -- null means for all industries
  difficulty_level TEXT DEFAULT 'beginner', -- beginner, intermediate, advanced
  estimated_read_time INTEGER, -- in minutes
  tags TEXT[] DEFAULT '{}',
  is_featured BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT true,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Track which content clients have viewed/completed
CREATE TABLE public.learning_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES public.learning_content(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  is_bookmarked BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_account_id, content_id)
);

-- Voice memos table
CREATE TABLE public.voice_memos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  audio_url TEXT NOT NULL,
  audio_duration INTEGER, -- in seconds
  transcript TEXT,
  transcription_status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  context TEXT, -- what the memo is about (e.g., 'deliverable_feedback', 'general', 'request')
  related_id UUID, -- optional reference to deliverable, project, etc.
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.learning_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_memos ENABLE ROW LEVEL SECURITY;

-- Learning content policies
CREATE POLICY "Anyone can view published learning content"
ON public.learning_content FOR SELECT
USING (is_published = true);

CREATE POLICY "Admins can manage learning content"
ON public.learning_content FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Learning progress policies
CREATE POLICY "Clients can manage their own progress"
ON public.learning_progress FOR ALL
USING (client_account_id IN (
  SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
))
WITH CHECK (client_account_id IN (
  SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
));

CREATE POLICY "Admins can view all progress"
ON public.learning_progress FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Voice memos policies
CREATE POLICY "Clients can create voice memos"
ON public.voice_memos FOR INSERT
WITH CHECK (client_account_id IN (
  SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
));

CREATE POLICY "Clients can view their voice memos"
ON public.voice_memos FOR SELECT
USING (client_account_id IN (
  SELECT client_account_id FROM client_portal_users WHERE user_id = auth.uid()
));

CREATE POLICY "Admins can manage all voice memos"
ON public.voice_memos FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create storage bucket for voice memos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('voice-memos', 'voice-memos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for voice memos
CREATE POLICY "Clients can upload voice memos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'voice-memos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Clients can view their voice memos"
ON storage.objects FOR SELECT
USING (bucket_id = 'voice-memos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can access all voice memos"
ON storage.objects FOR ALL
USING (bucket_id = 'voice-memos' AND has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_learning_content_updated_at
BEFORE UPDATE ON public.learning_content
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();