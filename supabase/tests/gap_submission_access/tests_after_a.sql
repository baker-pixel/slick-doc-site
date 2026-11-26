\set ON_ERROR_STOP on
\echo '== PHASE 1: after migration A (additive), RPCs as anon'
set role anon;

-- create: returns id + token, row exists, server-controlled columns ignored
select set_config('t.created', public.create_gap_submission(jsonb_build_object(
  'first_name','Cy','last_name','New','business_name','Newco','email','cy@new.co','phone','555',
  'status','weird','id','99999999-9999-9999-9999-999999999999','resume_token','88888888-8888-8888-8888-888888888888',
  'ai_analysis','{"forged":true}','context_profile','{"forged":true}','overall_score',100,'score_breakdown','{"forged":1}',
  'contact_submission_id','77777777-7777-7777-7777-777777777777','not_a_column','ignored'))::text, false);
select public.t_assert(current_setting('t.created')::jsonb ? 'id' and current_setting('t.created')::jsonb ? 'resume_token', 'create returns id and resume_token');
select public.t_assert((current_setting('t.created')::jsonb->>'id') <> '99999999-9999-9999-9999-999999999999', 'caller cannot choose the id');
select public.t_assert((current_setting('t.created')::jsonb->>'resume_token') <> '88888888-8888-8888-8888-888888888888', 'caller cannot choose the resume token');
reset role;
select public.t_assert((select status = 'submitted' and current_step = 1 and is_partial = false and ai_analysis is null and context_profile is null and overall_score is null and score_breakdown is null and contact_submission_id is null
   from public.gap_analysis_submissions where id = (current_setting('t.created')::jsonb->>'id')::uuid), 'forged server-controlled fields were ignored; defaults applied; unknown status becomes submitted');
set role anon;

-- partial save keeps in_progress
select set_config('t.partial', public.create_gap_submission('{"first_name":"Di","last_name":"P","business_name":"Pco","email":"di@p.co","status":"in_progress","current_step":3,"is_partial":true}')::text, false);
reset role;
select public.t_assert((select status='in_progress' and current_step=3 and is_partial from public.gap_analysis_submissions where id=(current_setting('t.partial')::jsonb->>'id')::uuid), 'partial save keeps in_progress, step 3');
set role anon;

-- validation
do $$ begin perform public.create_gap_submission('{"last_name":"x","business_name":"x","email":"a@b.co"}'); raise exception 'should have failed: missing first_name'; exception when sqlstate '22023' then null; end $$;
do $$ begin perform public.create_gap_submission('{"first_name":"x","last_name":"x","business_name":"x","email":"not-an-email"}'); raise exception 'should have failed: bad email'; exception when sqlstate '22023' then null; end $$;
do $$ begin perform public.create_gap_submission('[1,2]'); raise exception 'should have failed: not an object'; exception when sqlstate '22023' then null; end $$;
do $$ begin perform public.create_gap_submission(jsonb_build_object('first_name','x','last_name','x','business_name','x','email','a@b.co','additional_notes', repeat('z', 250000))); raise exception 'should have failed: too large'; exception when sqlstate '54000' then null; end $$;

-- read by token
select public.t_assert((public.get_gap_submission_by_token('e0000000-0000-0000-0000-00000000000a')->>'email') = 'owner@acme.com', 'get by token returns the owner row incl. email');
select public.t_assert(not (public.get_gap_submission_by_token('e0000000-0000-0000-0000-00000000000a') ? 'context_profile'), 'context_profile is never returned');
select public.t_assert(public.get_gap_submission_by_token('00000000-0000-0000-0000-000000000000') is null, 'unknown token returns null');

-- report by id: finished only, no contact details, no token
select public.t_assert((public.get_gap_report_by_id('d0000000-0000-0000-0000-00000000000a')->>'business_name') = 'Acme Plumbing', 'finished report is readable by id');
select public.t_assert(not (public.get_gap_report_by_id('d0000000-0000-0000-0000-00000000000a') ?| array['email','phone','first_name','last_name','resume_token','context_profile','contact_submission_id']), 'report carries no contact details, token or internal fields');
select public.t_assert((public.get_gap_report_by_id('d0000000-0000-0000-0000-00000000000a')->'ai_analysis') = '{"x":1}'::jsonb, 'report carries ai_analysis');
select public.t_assert(public.get_gap_report_by_id('d0000000-0000-0000-0000-00000000000b') is null, 'an in-progress submission is NOT readable by id');
select public.t_assert(public.get_gap_report_by_id('00000000-0000-0000-0000-000000000000') is null, 'unknown id returns null');

-- score save by token
select public.t_assert(public.save_gap_scorecard('e0000000-0000-0000-0000-00000000000a', 77, '{"a":1}') = true, 'score saved for own token');
select public.t_assert(public.save_gap_scorecard('00000000-0000-0000-0000-000000000000', 1, '{}') = false, 'unknown token saves nothing');

-- helper is not callable by anon
do $$ begin perform public.portal_user_owns_submission('a','b'); raise exception 'should have been denied'; exception when insufficient_privilege then null; end $$;
reset role;
select public.t_assert((select overall_score = 77 from public.gap_analysis_submissions where id = 'd0000000-0000-0000-0000-00000000000a'), 'score persisted on the right row');
select public.t_assert((select count(*) from public.gap_analysis_submissions where overall_score = 77) = 1, 'score persisted on ONLY that row');
\echo 'PHASE 1 ok: RPCs behave as specified'
