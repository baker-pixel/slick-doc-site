-- content_calendar has carried a single "Admin full access" policy
-- (USING (true), no role restriction -- applies to PUBLIC, including fully
-- unauthenticated requests) since its creation on 2025-12-05. Unlike the
-- five tables hardened on 2026-04-23 (client_accounts, generated_content,
-- client_reports, sop_documents, automation_jobs), this one was never
-- touched by that pass -- confirmed live: an anonymous request with just
-- the public anon key can currently read every client's scheduled/draft
-- content, including titles and which client they belong to.
--
-- Replace with real policies: has_role()-gated admin access (matching the
-- pattern used everywhere else in this schema), and a client SELECT policy
-- scoped via client_portal_users, since ClientCalendarTab and the portal
-- Home page's activity snapshot both read this table directly and have no
-- other path to it. No client WRITE policy -- confirmed no client-portal
-- code writes to content_calendar (ClientCalendarTab is read-only).

DROP POLICY IF EXISTS "Admin full access to content_calendar" ON public.content_calendar;

CREATE POLICY "content_calendar_admin_all" ON public.content_calendar
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "content_calendar_client_select" ON public.content_calendar
FOR SELECT TO authenticated
USING (
  client_account_id IN (
    SELECT client_account_id
    FROM public.client_portal_users
    WHERE user_id = auth.uid()
  )
);
