-- =============================================================
-- Prospect Engine Foundation — Sprint 1 Schema
-- =============================================================
-- Adds multi-client prospect ownership, ICP definition,
-- deep research fields, outreach coordination, and usage tracking.
-- =============================================================

-- ── 1. prospects: add client ownership + discovery fields ────

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS client_id        UUID REFERENCES public.client_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phone            TEXT,
  ADD COLUMN IF NOT EXISTS city             TEXT,
  ADD COLUMN IF NOT EXISTS source           TEXT NOT NULL DEFAULT 'inbound',
  ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by      TEXT,
  ADD COLUMN IF NOT EXISTS personalization_hook TEXT,
  ADD COLUMN IF NOT EXISTS icp_fit_score    INTEGER,
  ADD COLUMN IF NOT EXISTS research_snapshot JSONB;

ALTER TABLE public.prospects
  ADD CONSTRAINT prospects_source_check CHECK (source IN ('inbound', 'outbound'));

-- Expand status to include discovered (pending admin review) and rejected
ALTER TABLE public.prospects DROP CONSTRAINT IF EXISTS prospects_status_check;
ALTER TABLE public.prospects
  ADD CONSTRAINT prospects_status_check
  CHECK (status IN ('discovered', 'pending', 'nurture', 'converted', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_prospects_client_id         ON public.prospects (client_id);
CREATE INDEX IF NOT EXISTS idx_prospects_client_status     ON public.prospects (client_id, status);
CREATE INDEX IF NOT EXISTS idx_prospects_source            ON public.prospects (source);

-- ── 2. client_accounts: ICP + brand intelligence ─────────────

ALTER TABLE public.client_accounts
  ADD COLUMN IF NOT EXISTS icp              JSONB,
  ADD COLUMN IF NOT EXISTS business_summary JSONB,
  ADD COLUMN IF NOT EXISTS brand_voice      JSONB;

-- ── 3. client_context_versions — historical ICP snapshots ────

CREATE TABLE IF NOT EXISTS public.client_context_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  version          INTEGER NOT NULL DEFAULT 1,
  icp              JSONB,
  business_summary JSONB,
  brand_voice      JSONB,
  changed_by       TEXT,
  change_reason    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_context_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on client_context_versions"
  ON public.client_context_versions
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ctx_versions_client
  ON public.client_context_versions (client_id, version DESC);

-- ── 4. outreach_campaigns — multi-channel coordination ───────

CREATE TABLE IF NOT EXISTS public.outreach_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id     UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_contact_at TIMESTAMPTZ,
  next_contact_at TIMESTAMPTZ,
  contact_count   INTEGER NOT NULL DEFAULT 0,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT outreach_campaigns_channel_check
    CHECK (channel IN ('email', 'linkedin', 'facebook', 'instagram')),
  CONSTRAINT outreach_campaigns_status_check
    CHECK (status IN ('active', 'paused', 'completed', 'opted_out')),
  CONSTRAINT outreach_campaigns_prospect_channel_unique
    UNIQUE (prospect_id, channel)
);

ALTER TABLE public.outreach_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on outreach_campaigns"
  ON public.outreach_campaigns
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_outreach_client_id    ON public.outreach_campaigns (client_id);
CREATE INDEX IF NOT EXISTS idx_outreach_prospect_id  ON public.outreach_campaigns (prospect_id);
CREATE INDEX IF NOT EXISTS idx_outreach_next_contact
  ON public.outreach_campaigns (next_contact_at) WHERE status = 'active';

-- ── 5. client_usage — AI + API cost tracking ─────────────────

CREATE TABLE IF NOT EXISTS public.client_usage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  units       NUMERIC NOT NULL DEFAULT 1,
  cost_usd    NUMERIC(10, 6),
  source_fn   TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_usage_event_type_check
    CHECK (event_type IN (
      'ai_tokens', 'email_sent', 'maps_api_call',
      'prospect_research', 'scan_run', 'content_generated'
    ))
);

ALTER TABLE public.client_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on client_usage"
  ON public.client_usage
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_client_usage_client
  ON public.client_usage (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_usage_event
  ON public.client_usage (event_type, created_at DESC);
