-- Close tables that were readable/writable by anyone holding the public anon key.
--
-- Two causes:
--  * "Service role ..." policies written FOR ALL TO public USING (true). The
--    service role bypasses RLS anyway, so these only ever granted access to anon.
--  * "Admin ..." policies that were literally USING (true) instead of has_role().
--
-- Safe to do now because the admin panel signs in with a real admin JWT
-- (admin edge function mints a session for the shared admin user; Admin.tsx
-- verifyOtp's it), and edge functions use the service role. Tables below that
-- lacked an admin policy get one before the open policy is dropped.
--
-- Not covered here (need RPCs, public funnel reads them): gap_analysis_submissions.

begin;

-- 1. Open "service role" policies on tables that already have an admin policy
drop policy if exists "Service role full access client_onboarding" on public.client_onboarding;
drop policy if exists "Service role full access postforme accounts" on public.client_postforme_accounts;
drop policy if exists "Service role full access client_tasks" on public.client_tasks;
drop policy if exists "Service role full access client_workflows" on public.client_workflows;
drop policy if exists "Service role full access integration_configs" on public.integration_configs;
drop policy if exists "Service role full access task_templates" on public.task_templates;
drop policy if exists "Service role full access workflow_steps" on public.workflow_steps;

-- 2. Open policies on tables with no admin policy: replace with has_role admin
drop policy if exists "Service role can manage email_logs" on public.email_logs;
create policy "Admins can manage email_logs" on public.email_logs
  for all using (has_role((select auth.uid()), 'admin'::app_role));

drop policy if exists "Service role can manage email_queue" on public.email_queue;
create policy "Admins can manage email_queue" on public.email_queue
  for all using (has_role((select auth.uid()), 'admin'::app_role));

drop policy if exists "Service role can manage email_sequences" on public.email_sequences;
create policy "Admins can manage email_sequences" on public.email_sequences
  for all using (has_role((select auth.uid()), 'admin'::app_role));

drop policy if exists "Service role can manage email_tracking_events" on public.email_tracking_events;
create policy "Admins can manage email_tracking_events" on public.email_tracking_events
  for all using (has_role((select auth.uid()), 'admin'::app_role));

drop policy if exists "Admin full access to email_templates" on public.email_templates;
create policy "Admins can manage email_templates" on public.email_templates
  for all using (has_role((select auth.uid()), 'admin'::app_role));

drop policy if exists "Allow all task notifications operations" on public.task_notifications;
create policy "Admins can manage task_notifications" on public.task_notifications
  for all using (has_role((select auth.uid()), 'admin'::app_role));

drop policy if exists "Admins can manage ad campaigns" on public.ad_campaigns;
create policy "Admins can manage ad campaigns" on public.ad_campaigns
  for all using (has_role((select auth.uid()), 'admin'::app_role));

drop policy if exists "Admins can manage ad templates" on public.ad_templates;
create policy "Admins can manage ad templates" on public.ad_templates
  for all using (has_role((select auth.uid()), 'admin'::app_role));
-- ("Anyone can view active templates" stays: public ad-template gallery)

-- 3. pdf_leads: anyone may submit (INSERT stays) but no longer read every row
drop policy if exists "Public can view own submission" on public.pdf_leads;
create policy "Admins can manage pdf_leads" on public.pdf_leads
  for all using (has_role((select auth.uid()), 'admin'::app_role));

-- 4. Client portal (ClientIntegrationsTab) reads its own connected social
--    accounts; it only worked because of the open policy dropped above.
create policy "Clients view their own postforme accounts" on public.client_postforme_accounts
  for select using (
    client_id in (
      select client_account_id from public.client_portal_users
      where user_id = (select auth.uid())
    )
  );

commit;
