-- The generate-analysis edge function was locked behind checkAdminAuth (f6b38c6),
-- but the on_gap_analysis_insert trigger still called it with only the public
-- anon key, so every gap analysis submission got a 401: no AI analysis, no
-- report email. The trigger now authenticates with a private shared secret.
--
-- The secret lives in its own table, NOT admin_settings: admin_settings has a
-- "SELECT using (true)" policy for the public role, so anything stored there is
-- readable by anyone with the anon key.

create table if not exists public.internal_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

alter table public.internal_secrets enable row level security;
-- No policies on purpose: only service_role (bypasses RLS) and the
-- SECURITY DEFINER trigger below can read it.
revoke all on public.internal_secrets from anon, authenticated;

insert into public.internal_secrets (key, value)
values ('generate_analysis_trigger', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

create or replace function public.trigger_generate_gap_analysis()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://axbeaqpjyzzmbvyaofbn.supabase.co/functions/v1/generate-analysis',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_anon_key(),
      'x-internal-secret', (select value from public.internal_secrets where key = 'generate_analysis_trigger')
    ),
    body := jsonb_build_object('submission_id', new.id)
  );
  return new;
end;
$$;
