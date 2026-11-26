-- Lead table lockdown, part 1 of 2: ADDITIVE (eng-review fix SEC-1, wave 4).
--
-- public.gap_analysis_submissions holds every gap-analysis lead (name, email, phone, the
-- whole questionnaire, AI analysis). Its RLS let anyone with the public anon key (it ships
-- in the website bundle) read all rows ("resume_token IS NOT NULL" is true for every row)
-- and overwrite any row (UPDATE ... USING (true)). The 2026-10-29 lockdown skipped this
-- table because the public funnel talks to it directly.
--
-- This migration adds everything the funnel and the apps need to work WITHOUT those open
-- policies. It is safe to apply at any time: it changes no existing behaviour.
--   1. unique index on resume_token (the token IS the credential, and RPCs look it up)
--   2. RPCs for the funnel: create a submission, read one by token, read a finished report
--      by id (no contact details), persist the score
--   3. an admin policy (has_role) and a portal-user policy for the signed-in apps
-- Part 2 (supabase/pending-migrations/20261126140000_drop_anon_gap_submission_policies.sql)
-- drops the open anon policies. Apply it ONLY AFTER the new frontend is deployed, because
-- the OLD frontend reads and writes this table directly and would break.

-- 1. The resume token is a credential: unique, and indexed for lookups.
create unique index if not exists gap_analysis_submissions_resume_token_uniq
  on public.gap_analysis_submissions (resume_token);

-- 2a. Create a submission. Server-controlled columns can never be set by the caller.
create or replace function public.create_gap_submission(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
  r public.gap_analysis_submissions;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid submission' using errcode = '22023';
  end if;
  if length(p_data::text) > 200000 then
    raise exception 'submission too large' using errcode = '54000';
  end if;
  -- Never accept these from the caller: ids/timestamps/token are ours, ai_analysis and
  -- context_profile are written only by backend functions, scores are saved via
  -- save_gap_scorecard once computed.
  v := p_data - array['id','resume_token','created_at','updated_at','ai_analysis',
                      'context_profile','contact_submission_id','overall_score','score_breakdown'];

  if coalesce(btrim(v->>'first_name'), '') = ''
     or coalesce(btrim(v->>'last_name'), '') = ''
     or coalesce(btrim(v->>'business_name'), '') = ''
     or coalesce(v->>'email', '') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'first_name, last_name, business_name and a valid email are required' using errcode = '22023';
  end if;

  v := v || jsonb_build_object(
    'id', gen_random_uuid(),
    'resume_token', gen_random_uuid(),
    'created_at', now(),
    'updated_at', now(),
    'status', case when v->>'status' in ('submitted', 'in_progress') then v->>'status' else 'submitted' end,
    'current_step', coalesce((v->>'current_step')::int, 1),
    'is_partial', coalesce((v->>'is_partial')::boolean, false)
  );

  r := jsonb_populate_record(null::public.gap_analysis_submissions, v);
  insert into public.gap_analysis_submissions select r.*;
  return jsonb_build_object('id', r.id, 'resume_token', r.resume_token);
end
$$;

-- 2b. Read one submission with its resume token (the caller proves ownership by holding it).
create or replace function public.get_gap_submission_by_token(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(s) - 'context_profile' - 'contact_submission_id'
  from public.gap_analysis_submissions s
  where s.resume_token = p_token
$$;

-- 2c. Read a FINISHED report by id (the shareable report link). Same visibility rule as the
-- old public policy (submitted + completed), but without contact details or the token.
create or replace function public.get_gap_report_by_id(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(s) - array['first_name','last_name','email','phone','resume_token','context_profile','contact_submission_id']
  from public.gap_analysis_submissions s
  where s.id = p_id
    and s.status = 'submitted'
    and s.completed_at is not null
$$;

-- 2d. Persist the computed score on the caller's own submission. This is the only update
-- the funnel ever makes (saving progress inserts a new row).
create or replace function public.save_gap_scorecard(p_token uuid, p_overall_score integer, p_score_breakdown jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.gap_analysis_submissions
     set overall_score = p_overall_score,
         score_breakdown = p_score_breakdown,
         updated_at = now()
   where resume_token = p_token;
  return found;
end
$$;

revoke all on function public.create_gap_submission(jsonb) from public;
revoke all on function public.get_gap_submission_by_token(uuid) from public;
revoke all on function public.get_gap_report_by_id(uuid) from public;
revoke all on function public.save_gap_scorecard(uuid, integer, jsonb) from public;
grant execute on function public.create_gap_submission(jsonb) to anon, authenticated, service_role;
grant execute on function public.get_gap_submission_by_token(uuid) to anon, authenticated, service_role;
grant execute on function public.get_gap_report_by_id(uuid) to anon, authenticated, service_role;
grant execute on function public.save_gap_scorecard(uuid, integer, jsonb) to anon, authenticated, service_role;

-- 3a. Admins (the admin panel signs in with a real admin JWT; same pattern as the
-- 2026-10-29 lockdown).
drop policy if exists "Admins can manage gap submissions" on public.gap_analysis_submissions;
create policy "Admins can manage gap submissions" on public.gap_analysis_submissions
  for all to authenticated
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));

-- 3b. A signed-in portal user may read the submission that belongs to their own client
-- account (matched by email, or by business name as the portal's fallback does). The check
-- runs in a SECURITY DEFINER helper so it does not depend on the user's own RLS access to
-- client_portal_users / client_accounts.
create or replace function public.portal_user_owns_submission(p_email text, p_business_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.client_portal_users cpu
    join public.client_accounts ca on ca.id = cpu.client_account_id
    where cpu.user_id = auth.uid()
      and (
        (ca.email is not null and lower(ca.email) = lower(p_email))
        or (ca.business_name is not null and lower(ca.business_name) = lower(p_business_name))
      )
  )
$$;
revoke all on function public.portal_user_owns_submission(text, text) from public;
grant execute on function public.portal_user_owns_submission(text, text) to authenticated, service_role;

drop policy if exists "Portal users can read their own submission" on public.gap_analysis_submissions;
create policy "Portal users can read their own submission" on public.gap_analysis_submissions
  for select to authenticated
  using (public.portal_user_owns_submission(email, business_name));
