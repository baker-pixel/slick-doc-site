-- Create social_media_posts table
CREATE TABLE public.social_media_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'linkedin',
  content TEXT NOT NULL,
  media_urls TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  ai_generated BOOLEAN DEFAULT false,
  topic TEXT,
  tone TEXT,
  hashtags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.social_media_posts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their client posts"
ON public.social_media_posts FOR SELECT TO authenticated
USING (
  client_account_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create posts for their client"
ON public.social_media_posts FOR INSERT TO authenticated
WITH CHECK (
  client_account_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their client posts"
ON public.social_media_posts FOR UPDATE TO authenticated
USING (
  client_account_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their client posts"
ON public.social_media_posts FOR DELETE TO authenticated
USING (
  client_account_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
);

-- Timestamp trigger
CREATE TRIGGER update_social_media_posts_updated_at
BEFORE UPDATE ON public.social_media_posts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();