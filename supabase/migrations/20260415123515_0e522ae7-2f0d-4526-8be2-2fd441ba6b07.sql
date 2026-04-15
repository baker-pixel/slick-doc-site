-- 1. Allow clients to UPDATE their own workflow_steps
CREATE POLICY "Clients can update their own workflow steps"
ON public.workflow_steps
FOR UPDATE
TO authenticated
USING (
  client_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  client_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
);

-- 2. Fix invitation UPDATE policy — drop overly permissive one if it exists
DO $$
BEGIN
  -- Drop any UPDATE policies on client_invitations that use USING (true)
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'client_invitations'
      AND cmd = 'UPDATE'
      AND qual = 'true'
  ) THEN
    DROP POLICY IF EXISTS "Users can accept invitations" ON public.client_invitations;
    DROP POLICY IF EXISTS "Allow invitation acceptance" ON public.client_invitations;
  END IF;
END $$;

-- Drop any existing broad UPDATE policies by common names
DROP POLICY IF EXISTS "Users can accept invitations" ON public.client_invitations;
DROP POLICY IF EXISTS "Allow invitation acceptance" ON public.client_invitations;
DROP POLICY IF EXISTS "Authenticated users can update invitations" ON public.client_invitations;

-- Create properly scoped invitation UPDATE policy
CREATE POLICY "Invited user can accept their own invitation"
ON public.client_invitations
FOR UPDATE
TO authenticated
USING (
  lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  AND accepted_at IS NULL
  AND expires_at > now()
)
WITH CHECK (
  lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
);