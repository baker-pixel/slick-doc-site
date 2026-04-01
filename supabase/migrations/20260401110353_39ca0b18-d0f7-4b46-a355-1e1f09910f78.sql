
CREATE OR REPLACE FUNCTION public.trigger_generate_gap_analysis()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM net.http_post(
    url := 'https://dnwbdnwbwwoxiswzzikg.supabase.co/functions/v1/generate-analysis',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRud2Jkbndid3dveGlzd3p6aWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDA1MTQsImV4cCI6MjA4MDI3NjUxNH0.amvnQ2awpqfha74plLyIRviB7FnsfkaY4ZaQPp84CPI"}'::jsonb,
    body := jsonb_build_object('submission_id', NEW.id)
  );
  RETURN NEW;
END;
$function$;

CREATE TRIGGER on_gap_analysis_insert
  AFTER INSERT ON public.gap_analysis_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_generate_gap_analysis();
