-- Replace permissive brand_assets RLS with granular per-role policies.
-- Drops all existing policies first to avoid conflicts.

DROP POLICY IF EXISTS "Clients can view their brand assets" ON public.brand_assets;
DROP POLICY IF EXISTS "Admins can manage all brand assets" ON public.brand_assets;
DROP POLICY IF EXISTS "Authenticated users can insert brand assets" ON public.brand_assets;

-- SELECT
CREATE POLICY "Admins select all brand assets"
ON public.brand_assets FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients select own brand assets"
ON public.brand_assets FOR SELECT
USING (
  client_account_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
);

-- INSERT
CREATE POLICY "Admins insert brand assets"
ON public.brand_assets FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients insert brand assets for own account"
ON public.brand_assets FOR INSERT
WITH CHECK (
  client_account_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
);

-- UPDATE
CREATE POLICY "Admins update brand assets"
ON public.brand_assets FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients update own brand assets"
ON public.brand_assets FOR UPDATE
USING (
  client_account_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  client_account_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
);

-- DELETE
CREATE POLICY "Admins delete brand assets"
ON public.brand_assets FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Clients can only delete unconfirmed assets from their own account
CREATE POLICY "Clients delete own unconfirmed brand assets"
ON public.brand_assets FOR DELETE
USING (
  confirmed = false
  AND client_account_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
);

-- Trigger: prevent clients from changing structural fields (asset_type, file_path, file_url, etc.)
CREATE OR REPLACE FUNCTION public.protect_brand_asset_core_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.asset_type  := OLD.asset_type;
    NEW.category    := OLD.category;
    NEW.file_path   := OLD.file_path;
    NEW.file_url    := OLD.file_url;
    NEW.file_size   := OLD.file_size;
    NEW.is_primary  := OLD.is_primary;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER brand_asset_protect_core
  BEFORE UPDATE ON public.brand_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_brand_asset_core_fields();
