-- Discovery now asks Apollo (free people search) whether anyone is reachable at a
-- company BEFORE it becomes a lead. Companies with no contacts / no email on file
-- are remembered here so they are not re-found and re-checked every day, the same
-- way below-threshold companies already are. Same 90-day memory, same bare data:
-- domain, verdict, date. Only the allowed outcomes widen.
ALTER TABLE public.prospect_seen_domains DROP CONSTRAINT IF EXISTS prospect_seen_domains_outcome_check;
ALTER TABLE public.prospect_seen_domains
  ADD CONSTRAINT prospect_seen_domains_outcome_check
  CHECK (outcome IN ('below_threshold', 'unscorable', 'no_contact'));
