-- Housekeeping for scale (~100 clients).
--
-- 1. cron.job_run_details had grown to ~380k rows / 270 MB (every-minute jobs, back to April) and
--    is never trimmed. Only the last 7 days are useful for debugging; delete the rest nightly.
-- 2. Several heavy jobs fired in the same minute (09:00 UTC: auto-discover-prospects and
--    daily-client-automation, plus the hourly prospect drip). Spread them out so a burst of
--    edge-function invocations doesn't hit the worker limit together.

select cron.schedule(
  'cleanup-cron-run-details',
  '47 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);

do $$
declare r record;
begin
  for r in
    select * from (values
      ('auto-discover-prospects', '20 9 * * *'),
      ('client-context-refresh',  '40 9 * * 1'),
      ('weekly-portal-recap',     '20 8 * * 1'),
      ('run-prospect-drip',       '12 * * * *')
    ) as t(jobname, schedule)
  loop
    perform cron.alter_job((select jobid from cron.job where jobname = r.jobname), schedule := r.schedule);
  end loop;
end $$;

-- Trim the existing backlog now rather than waiting for the first nightly run.
delete from cron.job_run_details where end_time < now() - interval '7 days';
