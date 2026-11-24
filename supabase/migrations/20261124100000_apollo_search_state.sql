-- Per-client memory of which Apollo company searches (a keyword set + location +
-- size band) are still worth running.
--
-- Discovery used to restart every keyword at page 1 each day and keep paying
-- (1 Apollo credit per page) to re-fetch companies already in the pipeline;
-- a client whose searches had run dry (e.g. Resonant: 93 companies found, all
-- already known, 12 credits, 0 leads) did this every day forever, and the
-- 12-call budget was spent before newly generated keywords were tried.
--
-- Known companies are excluded at the source from prospects +
-- prospect_seen_domains (no new table needed for that). This table only
-- records the outcome of each search so a dry one can rest for a while:
--   * consecutive_empty  runs in a row that produced no new company
--   * exhausted_until    discovery skips the search until this time passes
--   * total_found / total_fresh  lifetime counters, the basis for ranking
--     keywords by how many usable leads they actually produce
--
-- Holds no contact data: only the search definition and counters.
CREATE TABLE IF NOT EXISTS public.apollo_search_state (
  client_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  search_key text NOT NULL,
  label text NOT NULL,
  runs integer NOT NULL DEFAULT 0,
  total_found integer NOT NULL DEFAULT 0,
  total_fresh integer NOT NULL DEFAULT 0,
  last_found integer NOT NULL DEFAULT 0,
  last_fresh integer NOT NULL DEFAULT 0,
  consecutive_empty integer NOT NULL DEFAULT 0,
  exhausted_until timestamptz,
  last_run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, search_key)
);

ALTER TABLE public.apollo_search_state ENABLE ROW LEVEL SECURITY; -- no policies: service role only
REVOKE ALL ON public.apollo_search_state FROM anon, authenticated;

COMMENT ON TABLE public.apollo_search_state IS
  'Outcome of each Apollo company search per client, so dry searches rest instead of burning credits daily. Service role only.';
