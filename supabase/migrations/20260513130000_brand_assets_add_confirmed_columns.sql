-- Add confirmed boolean and client_notes text to brand_assets.
-- confirmed is the source of truth; metadata.confirmation_status kept for backwards compat.

ALTER TABLE public.brand_assets
  ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_notes TEXT;

-- Backfill confirmed from existing metadata
UPDATE public.brand_assets
SET confirmed = true
WHERE metadata->>'confirmation_status' = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_brand_assets_confirmed
  ON public.brand_assets(client_account_id, confirmed);
