-- last_login_at was write-never: no policy allowed a client to update their
-- own client_portal_users row, so the admin "Portal Users" table always
-- showed "Never" regardless of actual sign-in activity. Same self-ownership
-- check already used by the existing SELECT/INSERT policies on this table.
CREATE POLICY "Users can update their own portal record"
ON public.client_portal_users
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
