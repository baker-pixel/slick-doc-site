-- First-party website traffic, collected by the WordPress plugin (v1.3.0+).
--
--   visitor -> plugin footer script -> track-pageview -> site_events (raw, 30d)
--           -> hourly rollup_site_traffic() -> site_traffic_daily (kept)
--           -> weekly snapshot_weekly_traffic() -> client_analytics.metrics.website_visits
--
-- No IPs and no cookies are stored: visitor_hash is computed in the edge
-- function from (site, IP, user agent, local day, secret salt) and the IP is
-- discarded, so a hash only links one visitor's pageviews within a single day.
-- "visits" is therefore distinct visitor-days, not GA-style users or sessions.

-- ── connected_sites: public tracking key + timezone ─────────────────────────
-- tracking_key is NOT a secret (it sits in every page's HTML). It only lets a
-- caller write pageviews for that one site; the plugin's secret token stays
-- server-side. A volatile DEFAULT is evaluated per row, so existing sites get
-- distinct keys on ALTER.
ALTER TABLE public.connected_sites
  ADD COLUMN IF NOT EXISTS tracking_key     text    NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  ADD COLUMN IF NOT EXISTS timezone         text,
  ADD COLUMN IF NOT EXISTS tracking_enabled boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS connected_sites_tracking_key_idx
  ON public.connected_sites (tracking_key);

-- ── site_events: raw pageviews (service role only) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.site_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_id       uuid        NOT NULL REFERENCES public.connected_sites(id) ON DELETE CASCADE,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  event         text        NOT NULL DEFAULT 'pageview',
  path          text        NOT NULL,
  referrer_host text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  device        text,
  visitor_hash  text        NOT NULL
);

CREATE INDEX IF NOT EXISTS site_events_site_time_idx
  ON public.site_events (site_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS site_events_time_idx
  ON public.site_events (occurred_at);

-- RLS on with no client/anon policy: raw rows are never readable from the
-- browser. Clients see rollups (below); the edge functions use the service role.
ALTER TABLE public.site_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages site_events"
  ON public.site_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── site_traffic_daily: per-day totals (kept) ───────────────────────────────
-- PRIMARY KEY (site_id, day) is a real unique constraint, which the rollup's
-- ON CONFLICT needs (a partial unique index would fail with 42P10).
CREATE TABLE IF NOT EXISTS public.site_traffic_daily (
  site_id       uuid    NOT NULL REFERENCES public.connected_sites(id) ON DELETE CASCADE,
  day           date    NOT NULL,            -- in the site's own timezone
  pageviews     integer NOT NULL DEFAULT 0,
  visits        integer NOT NULL DEFAULT 0,  -- distinct visitor_hash that day
  top_pages     jsonb   NOT NULL DEFAULT '[]'::jsonb,   -- [{path, views}]
  top_referrers jsonb   NOT NULL DEFAULT '[]'::jsonb,   -- [{host, views}]
  devices       jsonb   NOT NULL DEFAULT '{}'::jsonb,   -- {mobile: n, desktop: n, ...}
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, day)
);

ALTER TABLE public.site_traffic_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages site_traffic_daily"
  ON public.site_traffic_daily FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Clients view their own site_traffic_daily"
  ON public.site_traffic_daily FOR SELECT
  USING (
    site_id IN (
      SELECT id FROM public.connected_sites
      WHERE client_id IN (
        SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins view site_traffic_daily"
  ON public.site_traffic_daily FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ── rollup: recompute the last p_days local days for every site ─────────────
-- Recomputes whole local days (never a partial day), so re-running is safe and
-- idempotent. Raw rows live 30 days, so p_days must stay well under that.
CREATE OR REPLACE FUNCTION public.rollup_site_traffic(p_days integer DEFAULT 2)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.site_traffic_daily AS d
    (site_id, day, pageviews, visits, top_pages, top_referrers, devices, updated_at)
  WITH s AS (
    SELECT cs.id,
           CASE WHEN cs.timezone IS NOT NULL
                  AND EXISTS (SELECT 1 FROM pg_timezone_names n WHERE n.name = cs.timezone)
                THEN cs.timezone ELSE 'UTC' END AS tz
    FROM public.connected_sites cs
  ),
  e AS (
    SELECT ev.site_id,
           (ev.occurred_at AT TIME ZONE s.tz)::date AS day,
           ev.path, ev.referrer_host, coalesce(ev.device, 'unknown') AS device, ev.visitor_hash
    FROM public.site_events ev
    JOIN s ON s.id = ev.site_id
    WHERE ev.event = 'pageview'
      AND ev.occurred_at >= now() - make_interval(days => p_days + 2)  -- index-friendly prefilter
      AND (ev.occurred_at AT TIME ZONE s.tz)::date >= (now() AT TIME ZONE s.tz)::date - p_days
  ),
  base AS (
    SELECT site_id, day, count(*)::int AS pv, count(DISTINCT visitor_hash)::int AS visits
    FROM e GROUP BY site_id, day
  ),
  pages AS (
    SELECT site_id, day, jsonb_agg(jsonb_build_object('path', path, 'views', n) ORDER BY n DESC, path) AS j
    FROM (
      SELECT site_id, day, path, count(*) AS n,
             row_number() OVER (PARTITION BY site_id, day ORDER BY count(*) DESC, path) AS rn
      FROM e GROUP BY site_id, day, path
    ) t WHERE rn <= 10 GROUP BY site_id, day
  ),
  refs AS (
    SELECT site_id, day, jsonb_agg(jsonb_build_object('host', referrer_host, 'views', n) ORDER BY n DESC, referrer_host) AS j
    FROM (
      SELECT site_id, day, referrer_host, count(*) AS n,
             row_number() OVER (PARTITION BY site_id, day ORDER BY count(*) DESC, referrer_host) AS rn
      FROM e WHERE referrer_host IS NOT NULL GROUP BY site_id, day, referrer_host
    ) t WHERE rn <= 10 GROUP BY site_id, day
  ),
  devs AS (
    SELECT site_id, day, jsonb_object_agg(device, n) AS j
    FROM (SELECT site_id, day, device, count(*) AS n FROM e GROUP BY site_id, day, device) t
    GROUP BY site_id, day
  )
  SELECT base.site_id, base.day, base.pv, base.visits,
         coalesce(pages.j, '[]'::jsonb), coalesce(refs.j, '[]'::jsonb), coalesce(devs.j, '{}'::jsonb), now()
  FROM base
  LEFT JOIN pages USING (site_id, day)
  LEFT JOIN refs  USING (site_id, day)
  LEFT JOIN devs  USING (site_id, day)
  ON CONFLICT (site_id, day) DO UPDATE SET
    pageviews     = EXCLUDED.pageviews,
    visits        = EXCLUDED.visits,
    top_pages     = EXCLUDED.top_pages,
    top_referrers = EXCLUDED.top_referrers,
    devices       = EXCLUDED.devices,
    updated_at    = now();
END;
$$;

-- ── purge: raw events older than 30 days ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purge_site_events()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.site_events WHERE occurred_at < now() - interval '30 days';
$$;

-- ── weekly snapshot: replaces the GA4 pull (sync-ga4-analytics) ─────────────
-- Writes client_analytics.metrics.website_visits for the same trailing 7-day
-- window (yesterday back 6 days, UTC dates) that send-weekly-recap merges its
-- leads/opens into, so both land on one period row. Only clients whose site has
-- recorded traffic in the window get a value; a site with no plugin data is
-- left untouched rather than written as a misleading 0.
-- client_analytics has no unique constraint on (client, period), so this is
-- UPDATE-then-INSERT, same as the functions that write it.
CREATE OR REPLACE FUNCTION public.snapshot_weekly_traffic()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_end   date := (now() AT TIME ZONE 'UTC')::date - 1;
  v_start date := (now() AT TIME ZONE 'UTC')::date - 7;
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT cs.client_id, sum(t.visits)::int AS visits
    FROM public.connected_sites cs
    JOIN public.site_traffic_daily t ON t.site_id = cs.id
    WHERE cs.client_id IS NOT NULL
      AND t.day BETWEEN v_start AND v_end
    GROUP BY cs.client_id
  LOOP
    UPDATE public.client_analytics
       SET metrics = metrics || jsonb_build_object('website_visits', r.visits)
     WHERE client_account_id = r.client_id AND period_start = v_start AND period_end = v_end;

    IF NOT FOUND THEN
      INSERT INTO public.client_analytics (client_account_id, period_start, period_end, metrics)
      VALUES (r.client_id, v_start, v_end, jsonb_build_object('website_visits', r.visits));
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ── live read for the portal (called by get-live-analytics with the service role) ──
-- "On site now" is distinct visitors in the last 5 minutes. Past days come from
-- the hourly rollup; today is counted straight from raw events because the
-- rollup can lag by up to an hour. Days with no traffic are returned as zeros so
-- the chart always has 7 points ending on the site's own today.
CREATE OR REPLACE FUNCTION public.get_site_live_traffic(p_site_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz    text;
  v_today date;
  v_active integer;
  v_viewing jsonb;
  v_daily jsonb;
  v_last  timestamptz;
  v_today_visits integer;
  v_today_pv integer;
BEGIN
  SELECT CASE WHEN cs.timezone IS NOT NULL
                AND EXISTS (SELECT 1 FROM pg_timezone_names n WHERE n.name = cs.timezone)
              THEN cs.timezone ELSE 'UTC' END
    INTO v_tz
  FROM public.connected_sites cs WHERE cs.id = p_site_id;
  IF v_tz IS NULL THEN RETURN NULL; END IF;

  v_today := (now() AT TIME ZONE v_tz)::date;

  SELECT count(DISTINCT visitor_hash)::int INTO v_active
  FROM public.site_events
  WHERE site_id = p_site_id AND event = 'pageview' AND occurred_at >= now() - interval '5 minutes';

  SELECT coalesce(jsonb_agg(jsonb_build_object('path', path, 'visitors', n) ORDER BY n DESC, path), '[]'::jsonb)
    INTO v_viewing
  FROM (
    SELECT path, count(DISTINCT visitor_hash)::int AS n
    FROM public.site_events
    WHERE site_id = p_site_id AND event = 'pageview' AND occurred_at >= now() - interval '5 minutes'
    GROUP BY path ORDER BY n DESC, path LIMIT 5
  ) t;

  SELECT count(DISTINCT visitor_hash)::int, count(*)::int
    INTO v_today_visits, v_today_pv
  FROM public.site_events
  WHERE site_id = p_site_id AND event = 'pageview'
    AND occurred_at >= (v_today::timestamp AT TIME ZONE v_tz);

  -- Plain dates (not generate_series over dates, which yields timestamptz and
  -- would make the output depend on the session time zone).
  SELECT jsonb_agg(
           jsonb_build_object(
             'day',       g.day,
             'visits',    CASE WHEN g.day = v_today THEN v_today_visits ELSE coalesce(d.visits, 0) END,
             'pageviews', CASE WHEN g.day = v_today THEN v_today_pv     ELSE coalesce(d.pageviews, 0) END
           ) ORDER BY g.day)
    INTO v_daily
  FROM (SELECT v_today - 6 + n AS day FROM generate_series(0, 6) AS n) g
  LEFT JOIN public.site_traffic_daily d ON d.site_id = p_site_id AND d.day = g.day;

  SELECT max(occurred_at) INTO v_last FROM public.site_events WHERE site_id = p_site_id;

  RETURN jsonb_build_object(
    'active_now',    coalesce(v_active, 0),
    'viewing',       v_viewing,
    'daily',         coalesce(v_daily, '[]'::jsonb),
    'visits_today',  coalesce(v_today_visits, 0),
    'visits_7d',     (SELECT coalesce(sum((e->>'visits')::int), 0) FROM jsonb_array_elements(coalesce(v_daily, '[]'::jsonb)) e),
    'pageviews_7d',  (SELECT coalesce(sum((e->>'pageviews')::int), 0) FROM jsonb_array_elements(coalesce(v_daily, '[]'::jsonb)) e),
    'last_event_at', v_last
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rollup_site_traffic(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_site_events()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.snapshot_weekly_traffic()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_site_live_traffic(uuid)  FROM PUBLIC, anon, authenticated;

-- ── schedules (all plain SQL; no edge-function call) ────────────────────────
DO $$ BEGIN PERFORM cron.unschedule('rollup-site-traffic');  EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('purge-site-events');    EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('snapshot-weekly-traffic'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('rollup-site-traffic',     '7 * * * *',  $$SELECT public.rollup_site_traffic(2)$$);
SELECT cron.schedule('purge-site-events',       '17 3 * * *', $$SELECT public.purge_site_events()$$);
-- Monday 05:00 UTC: where sync-ga4-analytics used to run, ahead of the 08:00 recap.
SELECT cron.schedule('snapshot-weekly-traffic', '0 5 * * 1',  $$SELECT public.snapshot_weekly_traffic()$$);
