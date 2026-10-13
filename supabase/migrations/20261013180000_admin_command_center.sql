-- Admin Command Center: one place to see every scheduled job, what the agents
-- did, and what needs attention, plus a log of jobs an admin ran by hand.
--
-- The admin panel signs in with a shared password (no Supabase session), so
-- none of this can be an authenticated-role RPC. Both objects below are
-- service-role only and are reached through the admin-command-center edge
-- function, which checks the admin credential itself.

CREATE TABLE IF NOT EXISTS public.admin_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,
  label text NOT NULL,
  client_id uuid REFERENCES public.client_accounts(id) ON DELETE SET NULL,
  triggered_by text NOT NULL DEFAULT 'admin',
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'error')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  result jsonb,
  error text
);
CREATE INDEX IF NOT EXISTS admin_job_runs_started_idx ON public.admin_job_runs (started_at DESC);
ALTER TABLE public.admin_job_runs ENABLE ROW LEVEL SECURITY; -- no policies: service role only

CREATE OR REPLACE FUNCTION public.command_center_overview()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'generated_at', now(),

    -- Every scheduled job with its most recent firing (last 3 days is plenty
    -- for the fastest and slowest weekly/monthly jobs to show up or read "never").
    'cron', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'jobname', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'last_start', r.start_time, 'last_end', r.end_time,
        'last_status', r.status, 'last_message', left(coalesce(r.return_message, ''), 200),
        'fn', substring(j.command from 'functions/v1/([a-z0-9-]+)')
      ) ORDER BY j.jobname)
      FROM cron.job j
      LEFT JOIN LATERAL (
        SELECT d.start_time, d.end_time, d.status, d.return_message
        FROM cron.job_run_details d
        WHERE d.jobid = j.jobid AND d.start_time > now() - interval '3 days'
        ORDER BY d.start_time DESC LIMIT 1
      ) r ON true
    ), '[]'::jsonb),

    -- Scheduled HTTP calls that came back 4xx/5xx: the job "ran" but the function refused or crashed.
    'failed_http_24h', jsonb_build_object(
      'count', (SELECT count(*) FROM net._http_response WHERE created > now() - interval '24 hours' AND (status_code IS NULL OR status_code >= 400)),
      'recent', coalesce((
        SELECT jsonb_agg(jsonb_build_object('at', created, 'status', status_code, 'body', left(coalesce(content, ''), 160)) ORDER BY created DESC)
        FROM (SELECT created, status_code, content FROM net._http_response
              WHERE created > now() - interval '24 hours' AND (status_code IS NULL OR status_code >= 400)
              ORDER BY created DESC LIMIT 5) f
      ), '[]'::jsonb)
    ),

    -- What the AI did: calls by agent in the last 24h.
    'ai_24h', jsonb_build_object(
      'calls', (SELECT count(*) FROM agent_runs WHERE created_at > now() - interval '24 hours'),
      'failed', (SELECT count(*) FROM agent_runs WHERE created_at > now() - interval '24 hours' AND status <> 'ok'),
      'tokens', (SELECT coalesce(sum(coalesce(prompt_tokens, 0) + coalesce(completion_tokens, 0)), 0) FROM agent_runs WHERE created_at > now() - interval '24 hours'),
      'by_agent', coalesce((
        SELECT jsonb_agg(jsonb_build_object('agent', source, 'calls', calls, 'failed', failed, 'last_at', last_at) ORDER BY calls DESC)
        FROM (SELECT source, count(*) calls, count(*) FILTER (WHERE status <> 'ok') failed, max(created_at) last_at
              FROM agent_runs WHERE created_at > now() - interval '24 hours'
              GROUP BY source ORDER BY count(*) DESC LIMIT 14) a
      ), '[]'::jsonb)
    ),

    'queues', jsonb_build_object(
      'emails_waiting', (SELECT count(*) FROM email_queue WHERE status IN ('pending', 'scheduled', 'queued', 'processing')),
      'emails_failed_24h', (SELECT count(*) FROM email_queue WHERE status = 'failed' AND created_at > now() - interval '24 hours'),
      'image_batches_open', (SELECT count(*) FROM image_batch_jobs WHERE status NOT IN ('completed', 'failed', 'expired', 'cancelled'))
    ),

    'alerts', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'severity', severity, 'type', alert_type, 'title', title,
                                          'message', left(coalesce(message, ''), 220), 'source', source, 'at', created_at) ORDER BY created_at DESC)
      FROM (SELECT * FROM automation_alerts
            WHERE acknowledged_at IS NULL AND severity IN ('error', 'critical', 'warning') AND created_at > now() - interval '3 days'
            ORDER BY created_at DESC LIMIT 12) al
    ), '[]'::jsonb),

    'activity', coalesce((
      SELECT jsonb_agg(jsonb_build_object('at', f.created_at, 'client', ca.business_name, 'type', f.activity_type,
                                          'title', f.title, 'description', left(coalesce(f.description, ''), 200)) ORDER BY f.created_at DESC)
      FROM (SELECT * FROM activity_feed ORDER BY created_at DESC LIMIT 20) f
      LEFT JOIN client_accounts ca ON ca.id = f.client_account_id
    ), '[]'::jsonb),

    'manual_runs', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'job', m.job, 'label', m.label, 'client', ca.business_name, 'client_id', m.client_id,
                                          'status', m.status, 'by', m.triggered_by, 'started_at', m.started_at, 'finished_at', m.finished_at,
                                          'result', m.result, 'error', m.error) ORDER BY m.started_at DESC)
      FROM (SELECT * FROM admin_job_runs ORDER BY started_at DESC LIMIT 15) m
      LEFT JOIN client_accounts ca ON ca.id = m.client_id
    ), '[]'::jsonb),

    -- One block per client that is (or could be) receiving work.
    'clients', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ca.id, 'name', ca.business_name, 'tier', ca.tier, 'status', ca.status,
        'subscription', ca.subscription_status, 'period_end', ca.current_period_end,
        'payment_failed_at', ca.payment_failed_at, 'paused_for_billing', ca.paused_for_billing,
        'website', ca.website_url,

        'cycle', (SELECT jsonb_build_object('no', cy.cycle_no, 'status', cy.status, 'start', cy.period_start, 'end', cy.period_end,
                                            'steps', cy.plan->'steps', 'issues', cy.plan->'issues')
                  FROM client_cycles cy WHERE cy.client_account_id = ca.id ORDER BY cy.period_end DESC LIMIT 1),

        'social', jsonb_build_object(
          'upcoming', (SELECT count(*) FROM content_calendar c WHERE c.client_account_id = ca.id AND c.scheduled_for >= now() - interval '1 day' AND c.status <> 'failed'),
          'placeholders', (SELECT count(*) FROM content_calendar c WHERE c.client_account_id = ca.id AND c.scheduled_for >= now() - interval '1 day' AND c.content LIKE '[Auto-generated placeholder%'),
          'drafts', (SELECT count(*) FROM content_calendar c WHERE c.client_account_id = ca.id AND c.status = 'draft' AND c.content NOT LIKE '[Auto-generated placeholder%'),
          'scheduled', (SELECT count(*) FROM content_calendar c WHERE c.client_account_id = ca.id AND c.status = 'scheduled'),
          'published', (SELECT count(*) FROM content_calendar c WHERE c.client_account_id = ca.id AND c.status = 'published'),
          'failed', (SELECT count(*) FROM content_calendar c WHERE c.client_account_id = ca.id AND c.status = 'failed' AND c.updated_at > now() - interval '14 days'),
          'with_image', (SELECT count(*) FROM content_calendar c WHERE c.client_account_id = ca.id AND c.scheduled_for >= now() - interval '1 day' AND c.metadata->>'image_url' IS NOT NULL),
          'images_pending', (SELECT count(*) FROM content_calendar c WHERE c.client_account_id = ca.id AND c.scheduled_for >= now() - interval '1 day'
                              AND c.metadata->>'image_url' IS NULL AND c.metadata->>'image_skip' IS NULL AND c.content NOT LIKE '[Auto-generated placeholder%'),
          'awaiting_client', (SELECT count(*) FROM content_approvals a WHERE a.client_account_id = ca.id AND a.status = 'pending'),
          'held_for_admin', (SELECT count(*) FROM generated_content g WHERE g.client_id = ca.id AND g.status = 'pending_admin_review'),
          'next_post', (SELECT min(c.scheduled_for) FROM content_calendar c WHERE c.client_account_id = ca.id AND c.status = 'scheduled' AND c.scheduled_for > now())
        ),

        'prospects', jsonb_build_object(
          'total', (SELECT count(*) FROM prospects p WHERE p.client_id = ca.id),
          'to_review', (SELECT count(*) FROM prospects p WHERE p.client_id = ca.id AND p.status = 'discovered'),
          'to_review_no_email', (SELECT count(*) FROM prospects p WHERE p.client_id = ca.id AND p.status = 'discovered' AND coalesce(p.email, '') = ''),
          'in_outreach', (SELECT count(*) FROM prospects p WHERE p.client_id = ca.id AND p.status IN ('pending', 'nurture')),
          'replied', (SELECT count(*) FROM prospects p WHERE p.client_id = ca.id AND p.status IN ('replied', 'converted'))
        ),

        'insights', jsonb_build_object(
          'seo_score', (SELECT s.score FROM seo_audits s WHERE s.client_account_id = ca.id AND s.status = 'complete' ORDER BY s.created_at DESC LIMIT 1),
          'seo_at', (SELECT s.created_at FROM seo_audits s WHERE s.client_account_id = ca.id AND s.status = 'complete' ORDER BY s.created_at DESC LIMIT 1),
          'visibility_score', (SELECT v.total_score FROM ai_visibility_scores v WHERE v.client_id = ca.id ORDER BY v.computed_at DESC LIMIT 1),
          'visibility_at', (SELECT v.computed_at FROM ai_visibility_scores v WHERE v.client_id = ca.id ORDER BY v.computed_at DESC LIMIT 1)
        ),

        'connections', jsonb_build_object(
          'channels', coalesce((SELECT jsonb_agg(DISTINCT x.platform) FROM client_postforme_accounts x WHERE x.client_id = ca.id AND x.status = 'connected'), '[]'::jsonb),
          'mailbox', EXISTS (SELECT 1 FROM client_oauth_tokens t WHERE t.client_id = ca.id AND t.platform = 'smtp')
        ),

        'ai_7d', (SELECT jsonb_build_object('calls', count(*), 'failed', count(*) FILTER (WHERE r.status <> 'ok'))
                  FROM agent_runs r WHERE r.client_id = ca.id AND r.created_at > now() - interval '7 days')
      ) ORDER BY ca.business_name)
      FROM client_accounts ca
      WHERE ca.status <> 'cancelled'
    ), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.command_center_overview() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.command_center_overview() TO service_role;
