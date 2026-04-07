
-- ============================================================
-- Fix hardcoded JWT tokens in triggers and cron jobs
-- Single source of truth: get_anon_key() function
-- To rotate the key, update ONLY this function.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_anon_key()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT value FROM public.admin_settings WHERE key = 'supabase_anon_key' LIMIT 1;
$$;

-- Seed the key into admin_settings (single source of truth)
INSERT INTO public.admin_settings (key, value, description)
VALUES (
  'supabase_anon_key',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRud2Jkbndid3dveGlzd3p6aWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDA1MTQsImV4cCI6MjA4MDI3NjUxNH0.amvnQ2awpqfha74plLyIRviB7FnsfkaY4ZaQPp84CPI',
  'Supabase anon key used by pg_net triggers and cron jobs. Update here to rotate.'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ============================================================
-- Recreate all trigger functions using get_anon_key()
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_welcome_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM net.http_post(
    url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/queue-sequence-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := jsonb_build_object(
      'triggerType', 'contact_form',
      'recipientEmail', NEW.email,
      'recipientName', NEW.first_name || ' ' || NEW.last_name,
      'businessName', NEW.business_name
    )
  );
  NEW.pipeline_stage_id := (SELECT id FROM public.pipeline_stages WHERE stage_order = 2);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_gap_analysis_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM net.http_post(
      url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/queue-sequence-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || public.get_anon_key()
      ),
      body := jsonb_build_object(
        'triggerType', 'gap_analysis',
        'recipientEmail', NEW.email,
        'recipientName', NEW.first_name || ' ' || NEW.last_name,
        'businessName', NEW.business_name
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_pdf_lead_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM net.http_post(
    url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/queue-sequence-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := jsonb_build_object(
      'triggerType', 'pdf_download',
      'recipientEmail', NEW.email,
      'recipientName', COALESCE(NEW.first_name, 'there')
    )
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_new_lead_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM net.http_post(
    url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/queue-sequence-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := jsonb_build_object(
      'triggerType', 'new_lead',
      'recipientEmail', NEW.email,
      'recipientName', NEW.first_name || ' ' || NEW.last_name,
      'businessName', NEW.business_name
    )
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_hot_lead_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  hot_lead_stage_id UUID;
BEGIN
  SELECT id INTO hot_lead_stage_id FROM pipeline_stages WHERE name = 'Hot Lead' LIMIT 1;
  IF NEW.pipeline_stage_id = hot_lead_stage_id
     AND (OLD.pipeline_stage_id IS NULL OR OLD.pipeline_stage_id != hot_lead_stage_id) THEN
    PERFORM net.http_post(
      url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/queue-sequence-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || public.get_anon_key()
      ),
      body := jsonb_build_object(
        'triggerType', 'hot_lead',
        'recipientEmail', NEW.email,
        'recipientName', NEW.first_name || ' ' || NEW.last_name,
        'businessName', NEW.business_name
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_generate_gap_analysis()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM net.http_post(
    url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/generate-analysis',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := jsonb_build_object('submission_id', NEW.id)
  );
  RETURN NEW;
END;
$function$;

-- ============================================================
-- Reschedule all cron jobs with dynamic key via get_anon_key()
-- ============================================================

SELECT cron.unschedule('process-email-queue');
SELECT cron.schedule(
  'process-email-queue',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.unschedule('daily-client-automation');
SELECT cron.schedule(
  'daily-client-automation',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/run-ai-batch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{"batchType": "daily"}'::jsonb
  );
  $$
);

SELECT cron.unschedule('weekly-client-reports');
SELECT cron.schedule(
  'weekly-client-reports',
  '0 8 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/run-ai-batch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{"batchType": "weekly"}'::jsonb
  );
  $$
);

SELECT cron.unschedule('monthly-client-reports');
SELECT cron.schedule(
  'monthly-client-reports',
  '0 7 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/run-ai-batch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key()
    ),
    body := '{"batchType": "monthly"}'::jsonb
  );
  $$
);
