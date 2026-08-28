-- SocialPostComposer (client-portal SocialMediaTab) inserts directly into
-- content_calendar to save a draft/scheduled post, but the 2026-07-14 RLS
-- hardening (20260714020000_secure_content_calendar_rls.sql) only granted
-- clients SELECT -- its own comment claimed "no client-portal code writes
-- to content_calendar", which was wrong even at the time for this
-- component. Every save since has failed RLS silently (client-portal shows
-- a generic "Could not save the post."), for every platform, not just
-- LinkedIn.
--
-- Add the missing client INSERT policy, scoped the same way as the
-- existing client SELECT policy.
CREATE POLICY "content_calendar_client_insert" ON public.content_calendar
FOR INSERT TO authenticated
WITH CHECK (
  client_account_id IN (
    SELECT client_account_id
    FROM public.client_portal_users
    WHERE user_id = auth.uid()
  )
);
