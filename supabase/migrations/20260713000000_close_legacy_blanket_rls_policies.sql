-- A 2025-12-04 migration created client_accounts, sop_documents,
-- automation_jobs, generated_content, and client_reports with placeholder
-- "Admin full access to X" policies (USING (true) WITH CHECK (true), no
-- role restriction -- applies to PUBLIC, including fully unauthenticated
-- requests). A 2026-04-23 hardening migration added proper per-action
-- has_role()-gated policies for all five tables but only dropped its own
-- previously-created policies (idempotent guard), never the original
-- blanket ones. Since RLS policies are OR'd together, the blanket policy
-- alone has been granting full read/write/delete access to these tables
-- to anyone with the public anon key this whole time.
--
-- Before removing that safety net, client_accounts needs a real
-- client-scoped UPDATE policy: several client-portal flows (profile edits
-- in the Activity tab, marking onboarding complete) update their own
-- client_accounts row directly from the browser, and were only working
-- because of the blanket policy -- there was never a dedicated client
-- UPDATE policy, only the existing client SELECT policy.

CREATE POLICY "Clients can update their own account"
ON public.client_accounts
FOR UPDATE
USING (
  id IN (
    SELECT client_account_id
    FROM public.client_portal_users
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  id IN (
    SELECT client_account_id
    FROM public.client_portal_users
    WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admin full access to client_accounts" ON public.client_accounts;
DROP POLICY IF EXISTS "Admin full access to sop_documents" ON public.sop_documents;
DROP POLICY IF EXISTS "Admin full access to automation_jobs" ON public.automation_jobs;
DROP POLICY IF EXISTS "Admin full access to generated_content" ON public.generated_content;
DROP POLICY IF EXISTS "Admin full access to client_reports" ON public.client_reports;
