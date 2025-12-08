-- Create team_members table
CREATE TABLE public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  photo_url TEXT,
  bio TEXT,
  specialties TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index
CREATE INDEX idx_team_members_active ON public.team_members(is_active, display_order);

-- Enable RLS
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- RLS policies - all authenticated users can view active team members
CREATE POLICY "Anyone can view active team members"
  ON public.team_members
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage team members"
  ON public.team_members
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create storage bucket for team photos
INSERT INTO storage.buckets (id, name, public) VALUES ('team-photos', 'team-photos', true);

-- Storage policies
CREATE POLICY "Team photos are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'team-photos');

CREATE POLICY "Admins can upload team photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'team-photos' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update team photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'team-photos' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete team photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'team-photos' AND has_role(auth.uid(), 'admin'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();