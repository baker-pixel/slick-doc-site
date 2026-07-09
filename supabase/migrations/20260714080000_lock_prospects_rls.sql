-- prospects RLS was USING (true) for read/update/delete -- anyone holding
-- the public anon key could read and rewrite prospect names/emails. The
-- admin panel only worked through that hole (its legacy password login
-- carries no admin JWT). Panel traffic now goes through the `admin` edge
-- function (service role, checkAdminAuth), so the open policies can go.
--
-- Kept: public INSERT (the gap-analysis form creates inbound prospects
-- anonymously). Added: portal users can read their own client's prospects
-- (ClientProspectsTab queries the table directly from the portal).

DROP POLICY IF EXISTS "Admin can read prospects" ON public.prospects;
DROP POLICY IF EXISTS "Admin can update prospects" ON public.prospects;
DROP POLICY IF EXISTS "Admin can delete prospects" ON public.prospects;

CREATE POLICY prospects_admin_select ON public.prospects
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY prospects_admin_update ON public.prospects
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY prospects_admin_delete ON public.prospects
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY prospects_portal_select ON public.prospects
  FOR SELECT TO authenticated
  USING (client_id IN (
    SELECT client_account_id FROM public.client_portal_users
    WHERE user_id = auth.uid()
  ));
