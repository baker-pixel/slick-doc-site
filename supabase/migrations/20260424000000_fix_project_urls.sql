-- Update anon key to new project
UPDATE public.admin_settings
SET value = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4YmVhcXBqeXp6bWJ2eWFvZmJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMDk3NTEsImV4cCI6MjA5MjU4NTc1MX0.RLbpE81uPfdEKW1k-Hc-iyiEfyi6R15OGSMl2TTyf1w',
    updated_at = now()
WHERE key = 'supabase_anon_key';

-- Recreate all trigger functions with new project URL

CREATE OR REPLACE FUNCTION public.trigger_welcome_sequence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/queue-sequence-emails',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := jsonb_build_object('triggerType', 'contact_form', 'recipientEmail', NEW.email, 'recipientName', NEW.first_name || ' ' || NEW.last_name, 'businessName', NEW.business_name)
  );
  NEW.pipeline_stage_id := (SELECT id FROM public.pipeline_stages WHERE stage_order = 2);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_gap_analysis_sequence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM net.http_post(
      url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/queue-sequence-emails',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
      body := jsonb_build_object('triggerType', 'gap_analysis', 'recipientEmail', NEW.email, 'recipientName', NEW.first_name || ' ' || NEW.last_name, 'businessName', NEW.business_name)
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_pdf_lead_sequence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/queue-sequence-emails',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := jsonb_build_object('triggerType', 'pdf_download', 'recipientEmail', NEW.email, 'recipientName', COALESCE(NEW.first_name, 'there'))
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_new_lead_sequence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/queue-sequence-emails',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := jsonb_build_object('triggerType', 'new_lead', 'recipientEmail', NEW.email, 'recipientName', NEW.first_name || ' ' || NEW.last_name, 'businessName', NEW.business_name)
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_hot_lead_sequence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE hot_lead_stage_id UUID;
BEGIN
  SELECT id INTO hot_lead_stage_id FROM pipeline_stages WHERE name = 'Hot Lead' LIMIT 1;
  IF NEW.pipeline_stage_id = hot_lead_stage_id
     AND (OLD.pipeline_stage_id IS NULL OR OLD.pipeline_stage_id != hot_lead_stage_id) THEN
    PERFORM net.http_post(
      url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/queue-sequence-emails',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
      body := jsonb_build_object('triggerType', 'hot_lead', 'recipientEmail', NEW.email, 'recipientName', NEW.first_name || ' ' || NEW.last_name, 'businessName', NEW.business_name)
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_generate_gap_analysis()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/generate-analysis',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := jsonb_build_object('submission_id', NEW.id)
  );
  RETURN NEW;
END;
$function$;

-- Reschedule cron jobs with new project URL

DO $$ BEGIN PERFORM cron.unschedule('process-email-queue'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('process-email-queue', '*/10 * * * *', $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{}'::jsonb
  );
$$);

DO $$ BEGIN PERFORM cron.unschedule('daily-client-automation'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('daily-client-automation', '0 9 * * *', $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/run-ai-batch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{"batchType": "daily"}'::jsonb
  );
$$);

DO $$ BEGIN PERFORM cron.unschedule('weekly-client-reports'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('weekly-client-reports', '0 8 * * 1', $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/run-ai-batch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{"batchType": "weekly"}'::jsonb
  );
$$);

DO $$ BEGIN PERFORM cron.unschedule('monthly-client-reports'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('monthly-client-reports', '0 7 1 * *', $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/run-ai-batch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{"batchType": "monthly"}'::jsonb
  );
$$);

DO $$ BEGIN PERFORM cron.unschedule('publish-scheduled-content'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('publish-scheduled-content', '*/15 * * * *', $$
  SELECT net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/publish-scheduled-content',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.get_anon_key()),
    body := '{}'::jsonb
  );
$$);
