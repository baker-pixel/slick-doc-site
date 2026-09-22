-- `prospects` had no updated_at column, so nothing could tell when a
-- prospect was rejected (only created_at existed). That's needed to safely
-- resurrect a stale rejected prospect on re-discovery instead of leaving the
-- unique (client_id, website_url) index block it out forever.
ALTER TABLE public.prospects
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TRIGGER set_prospects_updated_at
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
