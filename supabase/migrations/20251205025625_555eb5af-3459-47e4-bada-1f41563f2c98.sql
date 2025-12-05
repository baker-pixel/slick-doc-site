-- Add category column to email_templates
ALTER TABLE public.email_templates 
ADD COLUMN category text NOT NULL DEFAULT 'marketing';

-- Update existing templates with appropriate categories
UPDATE public.email_templates SET category = 'transactional' WHERE slug IN ('appointment-confirmation', 'payment-receipt', 'service-completion', 'quote-followup');
UPDATE public.email_templates SET category = 'notification' WHERE slug IN ('new-lead-notification', 'gap-analysis-report-ready', 'strategy-call-reminder');
UPDATE public.email_templates SET category = 'marketing' WHERE slug IN ('re-engagement-email', 'webinar-invitation', 'case-study-share', 'referral-request', 'review-request');
UPDATE public.email_templates SET category = 'onboarding' WHERE slug IN ('onboarding-welcome', 'contact-thank-you');
UPDATE public.email_templates SET category = 'follow-up' WHERE slug IN ('abandoned-form-reminder', 'monthly-performance-update');