
-- Allow newly signed-up users to insert their own portal user record
CREATE POLICY "Users can create their own portal record"
ON public.client_portal_users
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Allow authenticated users to update invitations they are accepting (mark accepted_at)
CREATE POLICY "Users can accept invitations for their email"
ON public.client_invitations
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (accepted_at IS NOT NULL);

-- Allow new users to insert their own role
CREATE POLICY "Users can create their own role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());
