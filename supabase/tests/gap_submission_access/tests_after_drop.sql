\set ON_ERROR_STOP on
\set admin_id '''a0000000-0000-0000-0000-000000000001'''
\set portal_id '''b0000000-0000-0000-0000-000000000002'''
\set other_id '''c0000000-0000-0000-0000-000000000003'''
\echo '== PHASE 2: after the drop (part 2): anon is locked out, apps still work'
set role anon;
select public.t_assert((select count(*) from public.gap_analysis_submissions) = 0, 'anon can no longer read ANY row');
with u as (update public.gap_analysis_submissions set first_name = 'HACKED' returning 1) select public.t_assert((select count(*) from u) = 0, 'anon can no longer overwrite ANY row');
do $$ begin insert into public.gap_analysis_submissions (first_name,last_name,business_name,email) values ('a','b','c','d@e.co'); raise exception 'should have been denied'; exception when sqlstate '42501' then null; end $$;
-- the funnel still works through the RPCs
select set_config('t.c2', public.create_gap_submission('{"first_name":"Ed","last_name":"Z","business_name":"Zco","email":"ed@z.co","status":"submitted","completed_at":"2026-11-26T00:00:00Z"}')::text, false);
select public.t_assert((public.get_gap_submission_by_token((current_setting('t.c2')::jsonb->>'resume_token')::uuid)->>'email') = 'ed@z.co', 'funnel: create then resume by token works');
select public.t_assert(public.get_gap_report_by_id((current_setting('t.c2')::jsonb->>'id')::uuid) is not null, 'funnel: finished report readable by id');
select public.t_assert(public.save_gap_scorecard((current_setting('t.c2')::jsonb->>'resume_token')::uuid, 55, '{"s":1}') = true, 'funnel: score save works');
reset role;

-- admin sees and manages everything
select set_config('request.jwt.claim.sub', :admin_id, false);
set role authenticated;
select public.t_assert((select count(*) from public.gap_analysis_submissions) >= 5, 'admin can read all rows');
with u as (update public.gap_analysis_submissions set additional_notes = 'admin edit' where id = 'd0000000-0000-0000-0000-00000000000b' returning 1) select public.t_assert((select count(*) from u) = 1, 'admin can update');
reset role;

-- portal user: only their own submission (email match is case-insensitive); business-name fallback too
select set_config('request.jwt.claim.sub', :portal_id, false);
set role authenticated;
select public.t_assert((select count(*) from public.gap_analysis_submissions) = 1 and (select business_name from public.gap_analysis_submissions) = 'Acme Plumbing', 'portal user sees only their own submission (email match, case-insensitive)');
with u as (update public.gap_analysis_submissions set first_name = 'X' returning 1) select public.t_assert((select count(*) from u) = 0, 'portal user cannot update');
reset role;

-- a portal user of a different account, and a signed-in user with no account, see nothing
select set_config('request.jwt.claim.sub', :other_id, false);
set role authenticated;
select public.t_assert((select count(*) from public.gap_analysis_submissions) = 0, 'a different account''s portal user sees none of these');
reset role;
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000009', false);
set role authenticated;
select public.t_assert((select count(*) from public.gap_analysis_submissions) = 0, 'signed-in user with no role/account sees nothing');
reset role;
\echo 'PHASE 2 ok: locked down, funnel and apps still work'
