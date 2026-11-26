-- Push alerting + dead-man check (eng-review fix ALERT-1).
--
-- Problem: the check-alerts email cron was unscheduled on 2026-11-04, so every
-- pipeline alert sat in automation_alerts for nobody to see, and nothing noticed a
-- cron job that stopped firing (35 jobs; the weekly/monthly ones could be dead for
-- weeks). This migration:
--   1. keeps the NEWEST run of every job past the 7-day trim, so a monthly job's
--      last run is still visible (without it, weekly/monthly jobs look "never run").
--   2. adds public.stale_cron_jobs(): active jobs whose newest start is older than
--      twice the schedule's expected gap (+15 min grace).
--   3. reschedules check-alerts BY NAME (never by numeric job id: ids differ per
--      environment) and sends the pipeline secret, matching checkPipelineAuth.
--
-- DEPLOY ORDER: run this migration BEFORE deploying the check-alerts function,
-- because the new function rejects calls without x-internal-secret / service key.
--
-- Limits (known): job_run_details only proves pg_cron FIRED the HTTP call, not that
-- the function succeeded (function failures are alerts). A job that never ran has no
-- row and is not reported. This check cannot watch check-alerts itself.

-- 1. Retention: keep the newest run per job.
select cron.schedule(
  'cleanup-cron-run-details',
  '47 3 * * *',
  $$delete from cron.job_run_details d
    where d.end_time < now() - interval '7 days'
      and d.runid not in (select max(runid) from cron.job_run_details group by jobid)$$
);

-- 2a. Expected gap between starts for the schedule shapes we use. Deliberately
-- loose for lists/ranges (a looser gap can only miss, never false-alarm).
create or replace function public.cron_expected_gap(p_schedule text)
returns interval
language sql
immutable
as $$
  select case
    when p_schedule = '* * * * *'                      then interval '1 minute'
    when p_schedule ~ '^\*/[0-9]+ \* \* \* \*$'        then (substring(p_schedule from '^\*/([0-9]+) ') || ' minutes')::interval
    when p_schedule ~ '^[0-9,]+ \* \* \* \*$'          then interval '1 hour'
    when p_schedule ~ '^\S+ \S+ \* \* \*$'             then interval '1 day'
    when p_schedule ~ '^\S+ \S+ \* \* \S+$'            then interval '7 days'
    when p_schedule ~ '^\S+ \S+ \S+ \* \*$'            then interval '31 days'
    else null
  end
$$;

-- 2b. Stale jobs. SECURITY DEFINER with a pinned search_path; service role only.
create or replace function public.stale_cron_jobs()
returns table (jobname text, schedule text, last_run timestamptz, expected_gap interval)
language sql
security definer
set search_path = public, pg_temp
as $$
  select j.jobname::text, j.schedule::text, r.last_run, public.cron_expected_gap(j.schedule)
  from cron.job j
  join lateral (
    select max(d.start_time) as last_run
    from cron.job_run_details d
    where d.jobid = j.jobid
  ) r on r.last_run is not null
  where j.active
    and j.jobname is not null
    and public.cron_expected_gap(j.schedule) is not null
    and r.last_run < now() - (public.cron_expected_gap(j.schedule) * 2 + interval '15 minutes')
$$;

revoke all on function public.stale_cron_jobs() from public, anon, authenticated;
grant execute on function public.stale_cron_jobs() to service_role;

-- 3. Bring the digest back, by name, with the pipeline secret.
select cron.schedule(
  'check-alerts',
  '*/30 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/check-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key(),
      'x-internal-secret', (select value from public.internal_secrets where key = 'pipeline_cron')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cmd$
);
