-- Admin panel live updates: the sidebar alert badge and the Home dashboard
-- subscribe to these tables, but none were in the realtime publication, so
-- the subscriptions never delivered an event. Idempotent: skips tables that
-- are already published or don't exist.
do $$
declare
  t text;
begin
  foreach t in array array['automation_alerts', 'activity_feed', 'deliverables', 'client_accounts', 'content_calendar']
  loop
    if to_regclass('public.' || t) is not null
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
       ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
