-- Audit trail for the admin "view as client" feature: who opened which
-- client's portal and when. Read/insert for admins only; no update or delete.
CREATE TABLE IF NOT EXISTS public.admin_portal_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_portal_views_client_idx
  ON public.admin_portal_views (client_account_id, viewed_at DESC);

ALTER TABLE public.admin_portal_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read portal views"
  ON public.admin_portal_views FOR SELECT
  USING (has_role((select auth.uid()), 'admin'::app_role));

CREATE POLICY "Admins can log their own portal views"
  ON public.admin_portal_views FOR INSERT
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role) AND admin_user_id = (select auth.uid()));
