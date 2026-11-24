-- client_get_outreach_insights feeds the portal's "Lead outreach" status banner.
--  1. Admins (the "view as client" mode) were refused, so the banner showed "..." and
--     "Nothing scheduled" for a client that had 45 emails queued. Use portal_can_view.
--  2. The banner decided "Finding new leads is paused: N waiting for review" by counting every
--     'discovered' lead in the browser, but the daily search only pauses on leads that have an
--     email (the ones that can actually be approved). Leads Apollo found no email for sit in
--     'discovered' forever and made the banner claim a pause that was not happening. Return the
--     backend's own count so the banner can only say what the engine does.

CREATE OR REPLACE FUNCTION public.client_get_outreach_insights(p_client_account_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_queue    JSONB;
  v_upcoming JSONB;
  v_replies  JSONB;
  v_daily    JSONB;
  v_bounces  INT;
  v_awaiting INT;
BEGIN
  IF NOT public.portal_can_view(p_client_account_id) THEN
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

  -- Same predicate as auto-discover-prospects' review-queue ceiling.
  SELECT COUNT(*) INTO v_awaiting
  FROM prospects p
  WHERE p.client_id = p_client_account_id
    AND p.campaign_id IS NULL
    AND p.status = 'discovered'
    AND p.email IS NOT NULL AND p.email <> '';

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
    'queue',           COALESCE(v_queue, '{}'::jsonb),
    'awaiting_review', COALESCE(v_awaiting, 0),
    'upcoming',        v_upcoming,
    'replies',         v_replies,
    'daily',           v_daily,
    'bounces_30d',     COALESCE(v_bounces, 0)
  );
END;
$function$;
