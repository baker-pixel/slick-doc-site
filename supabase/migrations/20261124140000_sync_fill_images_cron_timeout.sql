-- sync-fill-missing-images generates one image per run, which takes longer
-- than 60s end to end (gpt-image-2 + overlay + upload). pg_net dropped the
-- connection at its 60s timeout and the edge function's work was lost, so no
-- slot was ever filled. Raise the cron call's timeout to 150s.
-- Already applied to production by hand; idempotent.
select cron.alter_job(
  job_id  := (select jobid from cron.job where jobname = 'sync-fill-missing-images'),
  command := replace(
    (select command from cron.job where jobname = 'sync-fill-missing-images'),
    'timeout_milliseconds := 60000',
    'timeout_milliseconds := 150000'
  )
)
where exists (select 1 from cron.job where jobname = 'sync-fill-missing-images');
