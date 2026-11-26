\set ON_ERROR_STOP on
\pset pager off
create or replace function public.t_assert(ok boolean, msg text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'ASSERT FAILED: %', msg; end if; end $$;
grant execute on function public.t_assert(boolean, text) to anon, authenticated, service_role;

-- ids used throughout
\set admin_id '''a0000000-0000-0000-0000-000000000001'''
\set portal_id '''b0000000-0000-0000-0000-000000000002'''
\set other_id '''c0000000-0000-0000-0000-000000000003'''

-- seed (as superuser): an admin, two client accounts with portal users, two submissions
insert into public.user_roles values (:admin_id::uuid, 'admin');
insert into public.client_accounts (id, email, business_name) values
  ('11111111-1111-1111-1111-111111111111', 'Owner@Acme.com', 'Acme Plumbing'),
  ('22222222-2222-2222-2222-222222222222', 'someone@else.com', 'Else Co');
insert into public.client_portal_users (user_id, client_account_id) values
  (:portal_id::uuid, '11111111-1111-1111-1111-111111111111'),
  (:other_id::uuid,  '22222222-2222-2222-2222-222222222222');
insert into public.gap_analysis_submissions (id, first_name, last_name, business_name, email, phone, status, completed_at, resume_token, ai_analysis, context_profile) values
  ('d0000000-0000-0000-0000-00000000000a', 'Ann', 'Acme', 'Acme Plumbing', 'owner@acme.com', '555-0100', 'submitted', now(), 'e0000000-0000-0000-0000-00000000000a', '{"x":1}', '{"secret":1}'),
  ('d0000000-0000-0000-0000-00000000000b', 'Bob', 'Partial', 'Zed Inc', 'bob@zed.com', '555-0101', 'in_progress', null, 'e0000000-0000-0000-0000-00000000000b', null, null);

\echo '== PHASE 0: today (live policies only): reproduce the exposure'
set role anon;
select public.t_assert((select count(*) from public.gap_analysis_submissions) = 2, 'phase0: anon can read EVERY row (this is the hole)');
with u as (update public.gap_analysis_submissions set first_name = 'HACKED' returning 1) select public.t_assert((select count(*) from u) = 2, 'phase0: anon can overwrite EVERY row (this is the hole)');
reset role;
update public.gap_analysis_submissions set first_name = case id when 'd0000000-0000-0000-0000-00000000000a' then 'Ann' else 'Bob' end;
\echo 'PHASE 0 ok: hole reproduced'
