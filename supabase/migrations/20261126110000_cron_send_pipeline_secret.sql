-- Send the pipeline secret from every cron job that calls a guarded function
-- (eng-review fix SEC-2, wave 2).
--
-- Eleven cron jobs called their edge functions with only the public anon key, and
-- those functions had no auth of their own, so anyone holding the anon key (it ships
-- in the website bundle) could trigger paid AI batches, image-batch polling and an
-- all-clients weekly email. The functions now call requirePipelineAuth; this
-- migration makes the cron jobs send the secret they check.
--
-- DEPLOY ORDER (important): apply THIS migration first, THEN deploy the functions.
-- The anon Authorization header is kept, so the old (unguarded) function code keeps
-- working after this migration. The reverse order makes every one of these jobs 401
-- (that is how publishing broke 24-30 Sep 2026).
--
-- Jobs are found BY NAME inside the loop (job ids differ per environment, never
-- hard-code them). The migration aborts, changing nothing for that job, if a command
-- does not contain the exact header text it expects.

insert into public.internal_secrets (key, value)
values ('pipeline_cron', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

do $$
declare
  r record;
  new_cmd text;
  old_hdr constant text := $h$'Authorization', 'Bearer ' || public.get_anon_key()$h$;
  new_hdr constant text := $h$'Authorization', 'Bearer ' || public.get_anon_key(), 'x-internal-secret', (select value from public.internal_secrets where key = 'pipeline_cron')$h$;
  jobs constant text[] := array[
    'check-image-batches', 'check-stalled-workflows', 'client-context-refresh',
    'detect-inactive-leads', 'process-agent-jobs', 'daily-client-automation',
    'monthly-client-reports', 'weekly-client-reports', 'send-approval-reminders',
    'seo-reaudit-scan', 'weekly-portal-recap'
  ];
begin
  for r in select jobid, jobname, command from cron.job where jobname = any (jobs) loop
    continue when r.command like '%x-internal-secret%';
    new_cmd := replace(r.command, old_hdr, new_hdr);
    if new_cmd = r.command then
      raise exception 'cron job % does not contain the expected Authorization header; refusing to guess', r.jobname;
    end if;
    perform cron.alter_job(r.jobid, command := new_cmd);
  end loop;

  if exists (select 1 from cron.job where jobname = any (jobs) and command not like '%x-internal-secret%') then
    raise exception 'some cron jobs still do not send x-internal-secret';
  end if;
end $$;
