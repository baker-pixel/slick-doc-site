-- Client-portal "Lead Outreach" transparency: one read-only RPC that exposes,
-- for the caller's own client account, the outreach data portal users can't
-- select directly (email_queue / prospect_replies are admin-only RLS and have
-- no client_id column; they're tied to a client via metadata / client_id).
--
-- Returns jsonb:
--   queue    { pending, next_send_at, sent_24h }
--   upcoming [ { scheduled_for, subject, drip_step, prospect_id, prospect_name } ]  next 7 days, max 25
--   replies  [ { id, received_at, prospect_id, prospect_name, from_address, subject, body, classification } ] max 25
--   daily    [ { day, sent, opened, replied } ]   last 30 days, oldest first
--   bounces_30d  int
CREATE OR REPLACE FUNCTION public.client_get_outreach_insights(p_client_account_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue    JSONB;
  v_upcoming JSONB;
  v_replies  JSONB;
  v_daily    JSONB;
  v_bounces  INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM client_portal_users
    WHERE user_id = auth.uid()
      AND client_account_id = p_client_account_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'pending',      COUNT(*) FILTER (WHERE q.status = 'pending'),
    'next_send_at', MIN(q.scheduled_for) FILTER (WHERE q.status = 'pending'),
    'sent_24h',     COUNT(*) FILTER (WHERE q.status = 'sent' AND q.sent_at > now() - interval '24 hours')
  ) INTO v_queue
  FROM email_queue q
  WHERE q.metadata->>'source' = 'run-prospect-drip'
    AND q.metadata->>'client_id' = p_client_account_id::TEXT;

  SELECT COALESCE(jsonb_agg(u ORDER BY u->>'scheduled_for'), '[]'::jsonb) INTO v_upcoming
  FROM (
    SELECT jsonb_build_object(
      'scheduled_for', q.scheduled_for,
      'subject',       q.subject,
      'drip_step',     (q.metadata->>'drip_step')::INT,
      'prospect_id',   p.id,
      'prospect_name', p.name
    ) AS u
    FROM email_queue q
    JOIN prospects p
      ON p.id::TEXT = q.metadata->>'prospect_id'
     AND p.client_id = p_client_account_id
    WHERE q.status = 'pending'
      AND q.metadata->>'source' = 'run-prospect-drip'
      AND q.metadata->>'client_id' = p_client_account_id::TEXT
      AND q.scheduled_for < now() + interval '7 days'
    ORDER BY q.scheduled_for ASC
    LIMIT 25
  ) s;

  SELECT COALESCE(jsonb_agg(r ORDER BY r->>'received_at' DESC), '[]'::jsonb) INTO v_replies
  FROM (
    SELECT jsonb_build_object(
      'id',             pr.id,
      'received_at',    pr.received_at,
      'prospect_id',    pr.prospect_id,
      'prospect_name',  p.name,
      'from_address',   pr.from_address,
      'subject',        pr.subject,
      'body',           left(COALESCE(pr.body_text, pr.snippet, ''), 4000),
      'classification', pr.classification
    ) AS r
    FROM prospect_replies pr
    LEFT JOIN prospects p ON p.id = pr.prospect_id
    WHERE pr.client_id = p_client_account_id
      AND pr.classification = 'reply'
    ORDER BY pr.received_at DESC
    LIMIT 25
  ) s;

  SELECT COUNT(*) INTO v_bounces
  FROM prospect_replies pr
  WHERE pr.client_id = p_client_account_id
    AND pr.classification = 'bounce'
    AND pr.received_at > now() - interval '30 days';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'day', d.day, 'sent', d.sent, 'opened', d.opened, 'replied', d.replied
         ) ORDER BY d.day), '[]'::jsonb) INTO v_daily
  FROM (
    SELECT g.day::date AS day,
      (SELECT COUNT(*) FROM email_queue q
        WHERE q.status = 'sent'
          AND q.metadata->>'source' = 'run-prospect-drip'
          AND q.metadata->>'client_id' = p_client_account_id::TEXT
          AND q.sent_at::date = g.day::date) AS sent,
      (SELECT COUNT(*) FROM prospects p
        WHERE p.client_id = p_client_account_id
          AND p.opened_at::date = g.day::date) AS opened,
      (SELECT COUNT(*) FROM prospects p
        WHERE p.client_id = p_client_account_id
          AND p.replied_at::date = g.day::date) AS replied
    FROM generate_series(current_date - 29, current_date, interval '1 day') AS g(day)
  ) d;

  RETURN jsonb_build_object(
    'queue',       COALESCE(v_queue, '{}'::jsonb),
    'upcoming',    v_upcoming,
    'replies',     v_replies,
    'daily',       v_daily,
    'bounces_30d', COALESCE(v_bounces, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.client_get_outreach_insights(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_get_outreach_insights(UUID) TO authenticated;
