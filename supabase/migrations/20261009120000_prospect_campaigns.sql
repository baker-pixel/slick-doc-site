-- Outreach campaigns: a named batch of prospects with a topic.
--
-- Until now every prospect belonged to one implicit, always-on pipeline and the
-- email copy could only be about the client's business in general. A campaign
-- adds:
--   * a topic (+ client-provided details the emails may state as fact), so a
--     client can announce a new product to its own customers instead of only
--     cold-pitching the business;
--   * an audience ('cold' prospects vs 'existing' contacts), which changes how
--     the emails are written;
--   * its own step count and a pause switch;
--   * a record of where its leads came from (CSV upload or AI discovery) and
--     who confirmed they may be contacted.
--
-- prospects.campaign_id NULL = the legacy always-on pipeline. Nothing about
-- existing rows changes.

CREATE TABLE IF NOT EXISTS public.prospect_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  kind            text NOT NULL CHECK (kind IN ('csv_list', 'discovery')),
  audience        text NOT NULL DEFAULT 'cold' CHECK (audience IN ('cold', 'existing')),
  topic           text CHECK (topic IS NULL OR char_length(topic) <= 200),
  -- Facts the CLIENT gave us about the topic. Unlike the AI-extracted business
  -- context these may be stated as fact in the emails.
  topic_details   text CHECK (topic_details IS NULL OR char_length(topic_details) <= 2000),
  max_steps       smallint NOT NULL DEFAULT 3 CHECK (max_steps BETWEEN 1 AND 4),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  source_filename text,
  -- Counts from the import (accepted / skipped and why). Informational.
  import_summary  jsonb,
  -- The uploader confirmed they have permission to contact these people.
  consent_at      timestamptz,
  consent_by      uuid,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT csv_campaign_requires_consent CHECK (kind <> 'csv_list' OR consent_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS prospect_campaigns_client_idx
  ON public.prospect_campaigns (client_id, created_at DESC);

ALTER TABLE public.prospect_campaigns ENABLE ROW LEVEL SECURITY;

-- Portal users read their own client's campaigns; admins read all. All writes
-- go through the prospect-campaign edge function (service role), which is where
-- the tier gate, mailbox check, suppression and consent rules live.
CREATE POLICY prospect_campaigns_portal_select ON public.prospect_campaigns
  FOR SELECT TO authenticated
  USING (client_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  ));

CREATE POLICY prospect_campaigns_admin_select ON public.prospect_campaigns
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS campaign_id         uuid REFERENCES public.prospect_campaigns(id) ON DELETE SET NULL,
  -- A real person's name from the uploaded list. prospects.name is the COMPANY
  -- (discovery) so it can never be used as a greeting.
  ADD COLUMN IF NOT EXISTS contact_first_name  text,
  ADD COLUMN IF NOT EXISTS contact_last_name   text,
  ADD COLUMN IF NOT EXISTS contact_title       text;

CREATE INDEX IF NOT EXISTS prospects_campaign_idx
  ON public.prospects (campaign_id) WHERE campaign_id IS NOT NULL;

-- Import dedupes by email per client; this keeps that lookup fast at 10k rows.
CREATE INDEX IF NOT EXISTS prospects_client_email_lower_idx
  ON public.prospects (client_id, lower(email)) WHERE email <> '';

-- Per-campaign counts for the portal. Computed in the database because a big
-- uploaded list (thousands of rows) cannot be summarised from the 1000-row
-- pages the browser can fetch. Same ownership check as the other client_*
-- RPCs; admins may read any client.
CREATE OR REPLACE FUNCTION public.client_campaign_stats(p_client_account_id uuid)
RETURNS TABLE (
  campaign_id  uuid,
  total        integer,
  queued       integer,
  in_outreach  integer,
  finished     integer,
  emailed      integer,
  opened       integer,
  clicked      integer,
  replied      integer,
  converted    integer,
  bounced      integer,
  unsubscribed integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1 FROM client_portal_users
      WHERE user_id = auth.uid() AND client_account_id = p_client_account_id
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    p.campaign_id,
    count(*)::integer,
    (count(*) FILTER (WHERE p.status IN ('discovered', 'pending')))::integer,
    (count(*) FILTER (WHERE p.status = 'nurture'))::integer,
    (count(*) FILTER (WHERE p.status = 'exhausted'))::integer,
    (count(*) FILTER (WHERE p.drip_step > 0))::integer,
    (count(*) FILTER (WHERE p.opened_at IS NOT NULL))::integer,
    (count(*) FILTER (WHERE p.clicked_at IS NOT NULL))::integer,
    (count(*) FILTER (WHERE p.status = 'replied'))::integer,
    (count(*) FILTER (WHERE p.status = 'converted'))::integer,
    (count(*) FILTER (WHERE p.status = 'bounced'))::integer,
    (count(*) FILTER (WHERE p.status = 'unsubscribed'))::integer
  FROM prospects p
  WHERE p.client_id = p_client_account_id AND p.campaign_id IS NOT NULL
  GROUP BY p.campaign_id;
END;
$$;

REVOKE ALL ON FUNCTION public.client_campaign_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_campaign_stats(uuid) TO authenticated;
