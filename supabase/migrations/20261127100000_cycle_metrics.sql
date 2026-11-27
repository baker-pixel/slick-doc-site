-- Cycle metrics: the numbers for one billing cycle next to the previous cycle's, for the
-- portal/admin cycle card and the cycle review.
--
-- Definitions deliberately match what the portal already shows (client_analytics_overview):
--   * outreach = pipeline prospects only (campaign_id IS NULL)
--   * opens    = HUMAN opens only (mail-security scanners excluded via outreach_human_opened_ids)
--   * a cycle's window ends at closed_at, not period_end: the rollover closes the previous
--     cycle when the next invoice is paid, so period_end of a closed cycle can be in the future.
-- Small samples are the norm here, so every group carries its count; callers decide what is
-- too small to conclude from.

-- One window for one client. Internal: only the wrapper below and service_role call it.
create or replace function public.cycle_window_metrics(p_client uuid, p_start timestamptz, p_end timestamptz)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with posts as (
    select cc.id,
           cc.platform,
           coalesce(nullif(cc.metadata ->> 'pillar', ''), 'unlabelled') as pillar,
           pm.views,
           pm.engagements
    from content_calendar cc
    left join post_metrics pm on pm.calendar_id = cc.id
    where cc.client_account_id = p_client
      and cc.status = 'published'
      and cc.published_at >= p_start and cc.published_at < p_end
  ),
  by_platform as (
    select platform,
           count(*) as posts,
           count(views) as measured,
           coalesce(sum(views), 0) as views_total,
           percentile_cont(0.5) within group (order by views) as views_median,
           coalesce(sum(engagements), 0) as engagements_total
    from posts group by platform
  ),
  by_pillar as (
    select pillar,
           count(*) as posts,
           count(views) as measured,
           percentile_cont(0.5) within group (order by views) as views_median
    from posts group by pillar
  ),
  human as (select unnest(coalesce(outreach_human_opened_ids(p_client), '{}'::uuid[])) as id),
  pr as (
    select * from prospects where client_id = p_client and campaign_id is null
  ),
  reply_classes as (
    select coalesce(classification, 'unclassified') as classification, count(*) as n
    from prospect_replies
    where client_id = p_client and received_at >= p_start and received_at < p_end
    group by 1
  ),
  traffic as (
    select t.day, t.visits, t.pageviews, t.top_referrers
    from connected_sites s
    join site_traffic_daily t on t.site_id = s.id
    where s.client_id = p_client
      and t.day >= (p_start at time zone 'utc')::date and t.day < (p_end at time zone 'utc')::date
  ),
  referrers as (
    select r ->> 'host' as host, sum((r ->> 'views')::int) as views
    from traffic, jsonb_array_elements(case when jsonb_typeof(top_referrers) = 'array' then top_referrers else '[]'::jsonb end) r
    group by 1 order by 2 desc limit 5
  )
  select jsonb_build_object(
    'window', jsonb_build_object('start', p_start, 'end', p_end, 'days', round(extract(epoch from (p_end - p_start)) / 86400.0, 1)),
    'social', jsonb_build_object(
      'published', (select count(*) from posts),
      'measured', (select count(views) from posts),
      'by_platform', coalesce((select jsonb_object_agg(platform, to_jsonb(by_platform) - 'platform') from by_platform), '{}'::jsonb),
      'by_pillar', coalesce((select jsonb_object_agg(pillar, to_jsonb(by_pillar) - 'pillar') from by_pillar), '{}'::jsonb)
    ),
    'outreach', jsonb_build_object(
      'leads', (select count(*) from pr where status <> 'discovered' and coalesce(email, '') <> '' and created_at >= p_start and created_at < p_end),
      'outreach_started', (select count(*) from pr where drip_step > 0 and approved_at >= p_start and approved_at < p_end),
      'opens', (select count(*) from pr where id in (select id from human) and opened_at >= p_start and opened_at < p_end),
      'clicks', (select count(*) from pr where clicked_at >= p_start and clicked_at < p_end),
      'replies', (select count(*) from pr where replied_at >= p_start and replied_at < p_end),
      'reply_classes', coalesce((select jsonb_object_agg(classification, n) from reply_classes), '{}'::jsonb)
    ),
    'website', jsonb_build_object(
      'visits', coalesce((select sum(visits) from traffic), 0),
      'pageviews', coalesce((select sum(pageviews) from traffic), 0),
      'days_with_data', (select count(*) from traffic),
      'window_days', greatest(0, ((p_end at time zone 'utc')::date - (p_start at time zone 'utc')::date)),
      'top_referrers', coalesce((select jsonb_agg(jsonb_build_object('host', host, 'views', views)) from referrers), '[]'::jsonb)
    ),
    'seo', jsonb_build_object(
      'score_end', (select value from outcome_metrics where client_account_id = p_client and source = 'seo' and metric = 'seo_score' and captured_at < p_end order by captured_at desc limit 1),
      'score_before', (select value from outcome_metrics where client_account_id = p_client and source = 'seo' and metric = 'seo_score' and captured_at < p_start order by captured_at desc limit 1)
    )
  )
$$;

revoke all on function public.cycle_window_metrics(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.cycle_window_metrics(uuid, timestamptz, timestamptz) to service_role;

-- A cycle and the cycle before it. Default cycle = the latest closed one, else the active one.
create or replace function public.cycle_metrics(p_client_account_id uuid, p_cycle_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  cur client_cycles;
  prev client_cycles;
  cur_end timestamptz;
  prev_end timestamptz;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.portal_can_view(p_client_account_id)) then
    raise exception 'Unauthorized';
  end if;

  select * into cur from client_cycles
   where client_account_id = p_client_account_id
     and (p_cycle_id is null or id = p_cycle_id)
   order by (status = 'closed') desc, cycle_no desc
   limit 1;
  if not found then return null; end if;

  select * into prev from client_cycles
   where client_account_id = p_client_account_id and cycle_no < cur.cycle_no
   order by cycle_no desc limit 1;

  cur_end := least(coalesce(cur.closed_at, cur.period_end), cur.period_end, now());
  prev_end := least(coalesce(prev.closed_at, prev.period_end), prev.period_end, now());

  return jsonb_build_object(
    'cycle', jsonb_build_object('id', cur.id, 'cycle_no', cur.cycle_no, 'status', cur.status, 'start', cur.period_start, 'end', cur_end),
    'current', public.cycle_window_metrics(p_client_account_id, cur.period_start, cur_end),
    'previous', case when prev.id is null then null else
      jsonb_build_object('cycle_no', prev.cycle_no, 'metrics', public.cycle_window_metrics(p_client_account_id, prev.period_start, prev_end))
    end
  );
end
$$;

revoke all on function public.cycle_metrics(uuid, uuid) from public, anon;
grant execute on function public.cycle_metrics(uuid, uuid) to authenticated, service_role;
