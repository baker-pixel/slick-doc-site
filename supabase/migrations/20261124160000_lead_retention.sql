-- Lead data retention. Everything the outreach engine stores per lead (site scan, hook, four
-- drafted emails) is useful for weeks, not years. This keeps what is still needed and removes
-- the rest, in tiers:
--   a) a lead that never got a reachable email, 30+ days old  -> deleted, domain remembered
--   b) a finished sequence with no reply, 180+ days old       -> heavy fields dropped, row kept
--   c) email bodies sent 90+ days ago                         -> body dropped, send record kept
-- Never touched: replied, converted, unsubscribed, bounced (suppression must be kept forever).
-- Deleting leads would erase the per-keyword results the learning loop needs, so their counts are
-- folded into prospect_search_rollup first and prospect_search_performance adds the two together.

-- 1) Counts of leads that no longer exist, per client and search.
CREATE TABLE IF NOT EXISTS public.prospect_search_rollup (
  client_id    uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  search_label text NOT NULL,
  leads        integer NOT NULL DEFAULT 0,
  emailed      integer NOT NULL DEFAULT 0,
  clicked      integer NOT NULL DEFAULT 0,
  replied      integer NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, search_label)
);
ALTER TABLE public.prospect_search_rollup ENABLE ROW LEVEL SECURITY; -- no policies: service role only
REVOKE ALL ON public.prospect_search_rollup FROM PUBLIC, anon, authenticated;

-- 2) Live leads + rolled-up history.
CREATE OR REPLACE VIEW public.prospect_search_performance AS
SELECT client_id, search_label,
       sum(leads)::bigint   AS leads,
       sum(emailed)::bigint AS emailed,
       sum(clicked)::bigint AS clicked,
       sum(replied)::bigint AS replied
FROM (
  SELECT p.client_id,
         p.research_snapshot->'found_by'->>'label' AS search_label,
         count(*)::bigint AS leads,
         count(*) FILTER (WHERE p.status NOT IN ('discovered', 'rejected', 'pending')
                            AND (p.drip_step >= 1 OR p.status IN ('replied', 'converted', 'exhausted', 'bounced', 'unsubscribed')))::bigint AS emailed,
         count(*) FILTER (WHERE p.clicked_at IS NOT NULL)::bigint AS clicked,
         count(*) FILTER (WHERE p.status IN ('replied', 'converted') OR p.replied_at IS NOT NULL)::bigint AS replied
  FROM public.prospects p
  WHERE p.research_snapshot->'found_by'->>'label' IS NOT NULL
  GROUP BY p.client_id, p.research_snapshot->'found_by'->>'label'
  UNION ALL
  SELECT client_id, search_label, leads, emailed, clicked, replied FROM public.prospect_search_rollup
) u
GROUP BY client_id, search_label;

REVOKE ALL ON public.prospect_search_performance FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.prospect_search_performance TO service_role;

-- 3) What each retention run did (or, in dry-run, would do).
CREATE TABLE IF NOT EXISTS public.lead_retention_runs (
  id         bigserial PRIMARY KEY,
  ran_at     timestamptz NOT NULL DEFAULT now(),
  dry_run    boolean NOT NULL,
  result     jsonb NOT NULL
);
ALTER TABLE public.lead_retention_runs ENABLE ROW LEVEL SECURITY; -- service role only
REVOKE ALL ON public.lead_retention_runs FROM PUBLIC, anon, authenticated;

-- 4) The retention pass. Dry-run by default: it reports counts and changes nothing.
CREATE OR REPLACE FUNCTION public.run_lead_retention(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_stale    constant interval := interval '30 days';
  c_compact  constant interval := interval '180 days';
  c_bodies   constant interval := interval '90 days';
  c_batch    constant integer  := 2000;   -- per tier, per run: a bad rule can never wipe the table in one go
  n_stale    integer;
  n_compact  integer;
  n_bodies   integer;
BEGIN
  SELECT count(*) INTO n_stale FROM public.prospects
   WHERE status = 'discovered' AND campaign_id IS NULL AND COALESCE(email, '') = ''
     AND created_at < now() - c_stale;

  SELECT count(*) INTO n_compact FROM public.prospects
   WHERE status = 'exhausted' AND replied_at IS NULL AND campaign_id IS NULL
     AND created_at < now() - c_compact
     AND COALESCE(research_snapshot->>'compacted_at', '') = '';

  SELECT count(*) INTO n_bodies FROM public.email_queue
   WHERE status = 'sent' AND sent_at < now() - c_bodies AND html_content <> '';

  IF NOT p_dry_run THEN
    -- a) never-reached leads: remember the domain and fold the counts into the rollup, then delete.
    WITH doomed AS (
      SELECT id, client_id, name, icp_fit_score,
             research_snapshot->'found_by'->>'label' AS label,
             lower(regexp_replace(regexp_replace(regexp_replace(regexp_replace(trim(COALESCE(website_url, '')),
               '^https?://', ''), '^www\.', ''), '[?#].*$', ''), '/+$', '')) AS domain
      FROM public.prospects
      WHERE status = 'discovered' AND campaign_id IS NULL AND COALESCE(email, '') = ''
        AND created_at < now() - c_stale
      ORDER BY created_at
      LIMIT c_batch
    ),
    seen AS (
      INSERT INTO public.prospect_seen_domains (client_id, domain, name, fit_score, reason, outcome)
      SELECT client_id, domain, name, icp_fit_score, 'no reachable contact (retention)', 'no_contact'
      FROM doomed WHERE domain <> ''
      ON CONFLICT (client_id, domain) DO NOTHING
    ),
    rolled AS (
      INSERT INTO public.prospect_search_rollup (client_id, search_label, leads)
      SELECT client_id, label, count(*)::int FROM doomed WHERE label IS NOT NULL GROUP BY client_id, label
      ON CONFLICT (client_id, search_label)
      DO UPDATE SET leads = public.prospect_search_rollup.leads + EXCLUDED.leads, updated_at = now()
    )
    DELETE FROM public.prospects WHERE id IN (SELECT id FROM doomed);

    -- b) finished, unanswered, old: drop the site scan and hook, keep identity, outcome and which search found it.
    UPDATE public.prospects p
       SET context_profile = NULL,
           top_weaknesses = NULL,
           personalization_hook = NULL,
           research_snapshot = jsonb_build_object('compacted_at', now())
             || CASE WHEN p.research_snapshot ? 'found_by' THEN jsonb_build_object('found_by', p.research_snapshot->'found_by') ELSE '{}'::jsonb END
     WHERE p.id IN (
       SELECT id FROM public.prospects
        WHERE status = 'exhausted' AND replied_at IS NULL AND campaign_id IS NULL
          AND created_at < now() - c_compact
          AND COALESCE(research_snapshot->>'compacted_at', '') = ''
        ORDER BY created_at
        LIMIT c_batch
     );

    -- c) old sent email bodies: keep subject, status and times as the send record.
    UPDATE public.email_queue
       SET html_content = ''
     WHERE id IN (
       SELECT id FROM public.email_queue
        WHERE status = 'sent' AND sent_at < now() - c_bodies AND html_content <> ''
        ORDER BY sent_at
        LIMIT c_batch * 5
     );
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'stale_leads_deleted', LEAST(n_stale, c_batch),     'stale_leads_eligible', n_stale,
    'leads_compacted', LEAST(n_compact, c_batch),       'leads_compactable', n_compact,
    'email_bodies_cleared', LEAST(n_bodies, c_batch * 5), 'email_bodies_eligible', n_bodies
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_lead_retention(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_lead_retention(boolean) TO service_role;

-- Nightly wrapper that also records the result. Starts in dry-run: switch to real deletes with
--   select cron.alter_job((select jobid from cron.job where jobname='lead-retention'),
--     command := $$select public.log_lead_retention(false)$$);
-- once a few nights of lead_retention_runs look right.
CREATE OR REPLACE FUNCTION public.log_lead_retention(p_dry_run boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  r := public.run_lead_retention(p_dry_run);
  INSERT INTO public.lead_retention_runs (dry_run, result) VALUES (p_dry_run, r);
  DELETE FROM public.lead_retention_runs WHERE ran_at < now() - interval '90 days';
END;
$$;
REVOKE ALL ON FUNCTION public.log_lead_retention(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_lead_retention(boolean) TO service_role;

SELECT cron.schedule('lead-retention', '20 3 * * *', $$select public.log_lead_retention(true)$$);

-- 5) Erase a client's lead-engine data (cancellation / erasure request). Does NOT touch the client's
--    account, brand context or content. The caller must pass the exact business name as confirmation.
CREATE OR REPLACE FUNCTION public.purge_client_lead_data(p_client_id uuid, p_confirm_business_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  n_prospects int; n_queue int; n_logs int; n_seen int; n_replies int; n_state int; n_roll int;
BEGIN
  SELECT business_name INTO v_name FROM public.client_accounts WHERE id = p_client_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Unknown client'; END IF;
  IF p_confirm_business_name IS DISTINCT FROM v_name THEN
    RAISE EXCEPTION 'Confirmation does not match the client business name';
  END IF;

  DELETE FROM public.email_queue    WHERE metadata->>'client_id' = p_client_id::text;  GET DIAGNOSTICS n_queue = ROW_COUNT;
  DELETE FROM public.email_logs     WHERE metadata->>'client_id' = p_client_id::text;  GET DIAGNOSTICS n_logs = ROW_COUNT;
  DELETE FROM public.prospect_replies WHERE client_id = p_client_id;                   GET DIAGNOSTICS n_replies = ROW_COUNT;
  DELETE FROM public.prospects      WHERE client_id = p_client_id;                     GET DIAGNOSTICS n_prospects = ROW_COUNT;
  DELETE FROM public.prospect_seen_domains WHERE client_id = p_client_id;              GET DIAGNOSTICS n_seen = ROW_COUNT;
  DELETE FROM public.apollo_search_state   WHERE client_id = p_client_id;              GET DIAGNOSTICS n_state = ROW_COUNT;
  DELETE FROM public.prospect_search_rollup WHERE client_id = p_client_id;             GET DIAGNOSTICS n_roll = ROW_COUNT;

  RETURN jsonb_build_object('prospects', n_prospects, 'email_queue', n_queue, 'email_logs', n_logs,
    'replies', n_replies, 'seen_domains', n_seen, 'search_state', n_state, 'rollup', n_roll);
END;
$$;
REVOKE ALL ON FUNCTION public.purge_client_lead_data(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_client_lead_data(uuid, text) TO service_role;
