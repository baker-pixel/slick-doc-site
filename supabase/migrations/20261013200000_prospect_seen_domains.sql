-- Prospects scoring below a client's fit threshold are deleted outright (no
-- contact data kept). Discovery used to avoid re-finding companies by looking
-- at stored prospect rows, so without a trace of what was already judged it
-- would re-find, re-scan and re-score the same poor fits every cycle.
-- This keeps only the company domain, the verdict and the date: no email, no
-- contact, no website content. Entries older than 90 days are ignored by
-- discovery (the company or the client's ICP may have changed).
CREATE TABLE IF NOT EXISTS public.prospect_seen_domains (
  client_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  domain text NOT NULL,
  name text,
  fit_score integer,
  reason text,
  outcome text NOT NULL CHECK (outcome IN ('below_threshold', 'unscorable')),
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, domain)
);
CREATE INDEX IF NOT EXISTS prospect_seen_domains_seen_idx ON public.prospect_seen_domains (client_id, seen_at DESC);
ALTER TABLE public.prospect_seen_domains ENABLE ROW LEVEL SECURITY; -- no policies: service role only
