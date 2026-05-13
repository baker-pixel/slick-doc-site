-- Unique partial index preventing duplicate color/font extractions for the same client.
-- Deduplication key: client + type + normalised name (lowercase, trimmed).
-- Covers colors (name = hex) and fonts (name = font-family).

CREATE UNIQUE INDEX IF NOT EXISTS brand_assets_value_dedup_idx
ON public.brand_assets (client_account_id, asset_type, lower(trim(name)))
WHERE asset_type IN ('color', 'font', 'language');
