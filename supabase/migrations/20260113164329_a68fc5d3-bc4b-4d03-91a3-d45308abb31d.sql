-- Add task dependencies support
ALTER TABLE public.client_tasks 
ADD COLUMN IF NOT EXISTS depends_on UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS sla_deadline_hours INTEGER,
ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

-- Add estimated_minutes and sla_hours to task_templates
ALTER TABLE public.task_templates
ADD COLUMN IF NOT EXISTS sla_hours INTEGER,
ADD COLUMN IF NOT EXISTS depends_on_categories TEXT[] DEFAULT '{}';

-- Create SLA tracking table
CREATE TABLE IF NOT EXISTS public.sla_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tier TEXT NOT NULL,
  task_category TEXT NOT NULL,
  target_hours INTEGER NOT NULL DEFAULT 24,
  warning_hours INTEGER NOT NULL DEFAULT 12,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tier, task_category)
);

-- Enable RLS
ALTER TABLE public.sla_configurations ENABLE ROW LEVEL SECURITY;

-- RLS policy for SLA configurations (admin access via password check or allow all for now since it's internal)
CREATE POLICY "Allow all access to sla_configurations"
  ON public.sla_configurations FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create QA checkpoints table
CREATE TABLE IF NOT EXISTS public.qa_checkpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.client_tasks(id) ON DELETE CASCADE,
  checkpoint_name TEXT NOT NULL,
  checkpoint_type TEXT NOT NULL DEFAULT 'manual', -- manual, auto, approval_required
  is_passed BOOLEAN DEFAULT false,
  checked_at TIMESTAMP WITH TIME ZONE,
  checked_by TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.qa_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to qa_checkpoints"
  ON public.qa_checkpoints FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create daily digest table
CREATE TABLE IF NOT EXISTS public.daily_digests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  generated_for DATE NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  sent_to TEXT[],
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.daily_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to daily_digests"
  ON public.daily_digests FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert default SLA configurations
INSERT INTO public.sla_configurations (tier, task_category, target_hours, warning_hours, description)
VALUES 
  ('foundation', 'onboarding', 48, 24, 'Onboarding tasks for Foundation tier'),
  ('foundation', 'seo', 168, 120, 'SEO tasks - weekly delivery'),
  ('foundation', 'content', 72, 48, 'Content creation tasks'),
  ('foundation', 'reports', 48, 24, 'Monthly reports'),
  ('growth', 'onboarding', 24, 12, 'Faster onboarding for Growth tier'),
  ('growth', 'seo', 120, 72, 'SEO tasks - faster turnaround'),
  ('growth', 'content', 48, 24, 'Content creation tasks'),
  ('growth', 'ads', 24, 12, 'Ad campaign tasks'),
  ('growth', 'reports', 24, 12, 'Monthly reports'),
  ('scale', 'onboarding', 12, 6, 'Priority onboarding for Scale tier'),
  ('scale', 'seo', 72, 48, 'SEO tasks - priority delivery'),
  ('scale', 'content', 24, 12, 'Content creation - same day'),
  ('scale', 'ads', 12, 6, 'Ad campaign - same day'),
  ('scale', 'reports', 12, 6, 'Weekly reports')
ON CONFLICT (tier, task_category) DO NOTHING;

-- Add trigger to update updated_at for sla_configurations
CREATE TRIGGER update_sla_configurations_updated_at
  BEFORE UPDATE ON public.sla_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();