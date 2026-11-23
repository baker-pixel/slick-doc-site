-- The admin Command Center page was removed; drop its backing objects.
-- (admin_job_runs held its manual-run log and was empty; no cron job referenced these.)
DROP FUNCTION IF EXISTS public.command_center_overview();
DROP FUNCTION IF EXISTS public.command_center_orphan_posts();
DROP TABLE IF EXISTS public.admin_job_runs;
