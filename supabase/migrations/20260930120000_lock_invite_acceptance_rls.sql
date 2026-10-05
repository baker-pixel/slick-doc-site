-- Invite acceptance moves server-side (get-invitation / accept-invitation edge
-- functions, service role). The browser-side policies that used to make it
-- possible were far too broad:
--   * client_portal_users INSERT only checked user_id = auth.uid(), so any
--     signed-in user could add themselves to ANY client_account_id.
--   * user_roles INSERT only checked user_id = auth.uid(), so any signed-in
--     user could grant themselves ANY role, including 'admin'.
--   * client_invitations UPDATE USING (true) let any user mark any invite
--     accepted.
--   * client_invitations "view by token" SELECT never compared to a specific
--     token, so an anonymous caller could list every open invite + token.
-- Deploy the two edge functions AND the frontend that calls them before
-- applying this, or invite acceptance breaks.

DROP POLICY IF EXISTS "Users can create their own portal record" ON public.client_portal_users;
DROP POLICY IF EXISTS "Users can create their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can accept invitations for their email" ON public.client_invitations;
DROP POLICY IF EXISTS "Anyone can view invitation by token" ON public.client_invitations;

-- "Users can update their own portal record" exists so last_login_at can be
-- stamped, but as written it also let a user repoint user_id/client_account_id
-- at any other client. Keep the policy, block identity changes for non-admins.
-- auth.uid() is NULL for service-role callers, which stay unrestricted.
CREATE OR REPLACE FUNCTION public.client_portal_users_lock_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (NEW.user_id IS DISTINCT FROM OLD.user_id
          OR NEW.client_account_id IS DISTINCT FROM OLD.client_account_id)
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'user_id and client_account_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_portal_users_lock_identity ON public.client_portal_users;
CREATE TRIGGER client_portal_users_lock_identity
  BEFORE UPDATE ON public.client_portal_users
  FOR EACH ROW EXECUTE FUNCTION public.client_portal_users_lock_identity();
