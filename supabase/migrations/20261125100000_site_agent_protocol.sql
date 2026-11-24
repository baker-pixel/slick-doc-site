-- Site agent protocol (WordPress plugin v2).
--
-- The v1 plugin is *called* by our servers with one static shared token. v2 is
-- the other way round: the plugin signs its own requests with a private key that
-- never leaves the site, and we store only the PUBLIC key. A database leak
-- therefore exposes nothing that can be used to impersonate a site or write to
-- it, and outbound-only HTTPS works through firewalls that block inbound REST.
--
--   plugin --signed heartbeat/pull/report--> site-agent edge fn --> these tables
--
-- v1 sites keep working: agent_mode stays 'legacy' until a v2 plugin registers.

-- ── connected_sites: agent identity + health ────────────────────────────────
ALTER TABLE public.connected_sites
  ADD COLUMN IF NOT EXISTS agent_mode        text        NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS agent_public_key  text,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS php_version       text,
  ADD COLUMN IF NOT EXISTS agent_info        jsonb       NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.connected_sites
  DROP CONSTRAINT IF EXISTS connected_sites_agent_mode_check;
ALTER TABLE public.connected_sites
  ADD CONSTRAINT connected_sites_agent_mode_check CHECK (agent_mode IN ('legacy', 'agent'));

-- agent_public_key is a public key: reading it lets nobody act as the site.

-- ── site_changes: the ledger every fix goes through ─────────────────────────
-- One row per change we ask a site to make. It records what was there before
-- (so it can be undone), where the change is in its life, and whether the live
-- page really shows it.
--
--   queued -> delivered -> applied -> verified
--                 \-> failed          \-> unverified (applied, page doesn't show it yet)
--   revert_queued -> revert_delivered -> reverted
CREATE TABLE IF NOT EXISTS public.site_changes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        uuid        NOT NULL REFERENCES public.connected_sites(id) ON DELETE CASCADE,
  fix_id         uuid        REFERENCES public.wp_fix_queue(id) ON DELETE SET NULL,
  post_id        integer,
  media_id       integer,
  page_url       text,
  field          text        NOT NULL,
  new_value      text        NOT NULL,
  before_value   text,                         -- reported by the plugin when it applies
  status         text        NOT NULL DEFAULT 'queued',
  attempts       integer     NOT NULL DEFAULT 0,
  error_message  text,
  requested_by   text,                         -- 'client' | 'admin' | 'auto'
  verify_note    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  delivered_at   timestamptz,
  applied_at     timestamptz,
  verified_at    timestamptz,
  reverted_at    timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_changes_status_check CHECK (status IN (
    'queued', 'delivered', 'applied', 'verified', 'unverified', 'failed',
    'revert_queued', 'revert_delivered', 'reverted'
  )),
  CONSTRAINT site_changes_target_check CHECK (
    post_id IS NOT NULL OR media_id IS NOT NULL OR field IN ('schema_jsonld', 'llms_txt')
  )
);

CREATE INDEX IF NOT EXISTS site_changes_site_status_idx ON public.site_changes (site_id, status);
CREATE INDEX IF NOT EXISTS site_changes_fix_idx ON public.site_changes (fix_id);

ALTER TABLE public.site_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages site_changes"
  ON public.site_changes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Clients view their own site_changes"
  ON public.site_changes FOR SELECT
  USING (
    site_id IN (
      SELECT id FROM public.connected_sites
      WHERE client_id IN (
        SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
      )
    )
  );

-- ── nonces: stop a captured request from being replayed ─────────────────────
-- Every signed request carries a one-time nonce inside a 5-minute clock window.
-- The primary key makes a repeat insert fail, which is the replay check.
CREATE TABLE IF NOT EXISTS public.site_agent_nonces (
  site_id uuid        NOT NULL,
  nonce   text        NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, nonce)
);
CREATE INDEX IF NOT EXISTS site_agent_nonces_seen_idx ON public.site_agent_nonces (seen_at);

ALTER TABLE public.site_agent_nonces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages site_agent_nonces"
  ON public.site_agent_nonces FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Nonces older than the window can never be replayed (the timestamp check
-- rejects them first), so they are only dead weight.
SELECT cron.schedule(
  'site-agent-nonce-cleanup',
  '35 3 * * *',
  $$DELETE FROM public.site_agent_nonces WHERE seen_at < now() - interval '1 day'$$
);
