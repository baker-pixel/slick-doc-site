-- Create email_templates table for custom templates
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  description TEXT,
  variables JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Admin access policy
CREATE POLICY "Admin full access to email_templates"
ON public.email_templates
FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default templates
INSERT INTO public.email_templates (name, slug, subject, html_content, description, variables) VALUES
('Welcome Email', 'welcome', 'Welcome to Orange Door Marketing!', '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h1 style="color: #F97316;">Welcome, {{firstName}}!</h1><p>Thank you for your interest in Orange Door Marketing.</p><p>We are excited to help {{businessName}} grow.</p><p>— The Orange Door Team</p></div>', 'Default welcome email for new contacts', '["firstName", "businessName"]'),
('Follow-up Email', 'followup', 'Following up with you', '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h1 style="color: #F97316;">Hi {{firstName}},</h1><p>Just checking in to see if you had any questions about our services.</p><p>We would love to help {{businessName}} achieve its marketing goals.</p><p>— The Orange Door Team</p></div>', 'Generic follow-up email', '["firstName", "businessName"]');