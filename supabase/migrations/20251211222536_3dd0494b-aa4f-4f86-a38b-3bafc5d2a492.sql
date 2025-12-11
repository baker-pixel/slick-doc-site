-- Add policy for clients to view their own client account
CREATE POLICY "Clients can view their own account"
ON public.client_accounts
FOR SELECT
USING (
  id IN (
    SELECT client_account_id 
    FROM client_portal_users 
    WHERE user_id = auth.uid()
  )
);