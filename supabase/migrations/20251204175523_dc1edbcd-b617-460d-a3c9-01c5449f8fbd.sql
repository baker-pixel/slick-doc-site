-- Email sequences (drip campaign templates)
CREATE TABLE public.email_sequences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL, -- 'form_submission', 'gap_analysis_complete', 'gap_analysis_partial', 'contact_form'
  emails JSONB NOT NULL DEFAULT '[]', -- Array of {delay_hours: number, subject: string, template: string}
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Email queue (scheduled emails to send)
CREATE TABLE public.email_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  error_message TEXT,
  metadata JSONB, -- Store context like form_id, sequence_id, etc.
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Email logs (history of all sent emails)
CREATE TABLE public.email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL, -- 'sent', 'failed', 'bounced'
  resend_id TEXT,
  metadata JSONB,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Admin-only policies (using service role for edge functions)
CREATE POLICY "Service role can manage email_sequences" ON public.email_sequences FOR ALL USING (true);
CREATE POLICY "Service role can manage email_queue" ON public.email_queue FOR ALL USING (true);
CREATE POLICY "Service role can manage email_logs" ON public.email_logs FOR ALL USING (true);

-- Trigger to update updated_at
CREATE TRIGGER update_email_sequences_updated_at
  BEFORE UPDATE ON public.email_sequences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for efficient queue processing
CREATE INDEX idx_email_queue_pending ON public.email_queue (scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_email_queue_status ON public.email_queue (status);

-- Insert default sequences
INSERT INTO public.email_sequences (name, trigger_type, emails) VALUES
(
  'Gap Analysis Follow-up',
  'gap_analysis_complete',
  '[
    {"delay_hours": 0, "subject": "Your SYSTEM Gap Report is Ready!", "template": "immediate_report"},
    {"delay_hours": 24, "subject": "Did you have a chance to review your report?", "template": "followup_1"},
    {"delay_hours": 72, "subject": "Quick question about your marketing goals", "template": "followup_2"},
    {"delay_hours": 168, "subject": "Ready to take the next step?", "template": "followup_3"}
  ]'::jsonb
),
(
  'Partial Gap Analysis Reminder',
  'gap_analysis_partial',
  '[
    {"delay_hours": 24, "subject": "Your gap analysis is waiting for you", "template": "resume_reminder_1"},
    {"delay_hours": 72, "subject": "Don''t lose your progress!", "template": "resume_reminder_2"}
  ]'::jsonb
),
(
  'Contact Form Response',
  'contact_form',
  '[
    {"delay_hours": 0, "subject": "Thanks for reaching out!", "template": "contact_immediate"},
    {"delay_hours": 48, "subject": "Following up on your inquiry", "template": "contact_followup"}
  ]'::jsonb
);