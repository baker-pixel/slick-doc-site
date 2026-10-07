-- Durable record of mailbox polling.
--
-- Until now poll-client-mailboxes was stateless: it re-scanned 21 days of each
-- client's inbox every run, kept only a short snippet on the prospect row and
-- recorded nothing about the run itself, so a dead mailbox (e.g. a domain with
-- no MX record) looked identical to a quiet one.
--
--   prospect_replies  one row per reply/bounce that is provably tied to our
--                     outreach (tracking id in In-Reply-To/References, or the
--                     sender is one of the client's prospects). Unrelated
--                     inbox mail is never stored. Unique per
--                     (client_id, message_id) so re-scanning is idempotent.
--   poll_runs         one row per mailbox poll: what was seen and any error.

CREATE TABLE IF NOT EXISTS public.prospect_replies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  -- Nullable on purpose: a reply carrying our tracking id whose email_logs row
  -- is gone is still a reply to us and must not be silently dropped.
  prospect_id   uuid REFERENCES public.prospects(id) ON DELETE SET NULL,
  email_log_id  uuid,
  message_id    text NOT NULL,
  in_reply_to   text,
  from_address  text,
  subject       text,
  received_at   timestamptz NOT NULL DEFAULT now(),
  classification text NOT NULL CHECK (classification IN ('reply', 'bounce')),
  match_method  text NOT NULL CHECK (match_method IN ('tracking_id', 'sender')),
  snippet       text,
  body_text     text,
  -- NULL until the prospect/queue/notification side effects have all run, so a
  -- crash mid-handling is retried on the next poll instead of lost.
  processed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospect_replies_client_message_key UNIQUE (client_id, message_id)
);

CREATE INDEX IF NOT EXISTS prospect_replies_prospect_idx
  ON public.prospect_replies (prospect_id, received_at DESC);
CREATE INDEX IF NOT EXISTS prospect_replies_client_received_idx
  ON public.prospect_replies (client_id, received_at DESC);

CREATE TABLE IF NOT EXISTS public.poll_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  started_at    timestamptz NOT NULL,
  finished_at   timestamptz NOT NULL DEFAULT now(),
  duration_ms   integer NOT NULL DEFAULT 0,
  ok            boolean NOT NULL,
  messages_seen integer NOT NULL DEFAULT 0,
  replies       integer NOT NULL DEFAULT 0,
  bounces       integer NOT NULL DEFAULT 0,
  stored        integer NOT NULL DEFAULT 0,
  error         text
);

CREATE INDEX IF NOT EXISTS poll_runs_client_finished_idx
  ON public.poll_runs (client_id, finished_at DESC);

-- Service role (edge functions) writes; admins read. Clients get no access
-- until we decide to expose replies in the portal.
ALTER TABLE public.prospect_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.prospect_replies FROM anon, authenticated;
REVOKE ALL ON public.poll_runs FROM anon, authenticated;
GRANT SELECT ON public.prospect_replies TO authenticated;
GRANT SELECT ON public.poll_runs TO authenticated;

CREATE POLICY "Admins can read prospect replies" ON public.prospect_replies
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can read poll runs" ON public.poll_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
