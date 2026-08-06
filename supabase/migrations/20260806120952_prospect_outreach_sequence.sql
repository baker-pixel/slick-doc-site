-- Cadence config for the prospect/outbound outreach campaign, reusing the
-- existing email_sequences model (already powers inbound marketing-lead
-- nurture via queue-sequence-emails) instead of the hardcoded 2/4/7/10-day
-- schedule that used to live directly in run-prospect-drip's source code.
-- Content is NOT driven by this row's templating -- run-prospect-drip
-- still generates AI-personalized copy per prospect at enrollment time
-- (that's what makes cold outreach work; a generic merge-field template
-- would be worse). Only delay_days per step is read from here, so admins
-- can retune the cadence without a code deploy.
INSERT INTO public.email_sequences (name, trigger_type, tier, emails, is_active)
SELECT
  'Prospect Outreach (Cold)',
  'prospect_outreach',
  NULL,
  '[
    {"delay_days": 2},
    {"delay_days": 3},
    {"delay_days": 5},
    {"delay_days": 7}
  ]'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_sequences WHERE trigger_type = 'prospect_outreach' AND tier IS NULL
);
