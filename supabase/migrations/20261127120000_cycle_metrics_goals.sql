-- cycle_metrics: add what the cycle-first Analytics page needs and the portal cannot read directly.
--   * cycle.period_end_nominal: the paid period's end, so the page can say "day 7 of 30"
--     (cycle.end stays the effective end, which is earlier for a cycle the rollover closed early)
--   * goals: the client's active goals with their current value. client_goals is admin-read-only,
--     so this definer function (access-checked like the rest) is the only way a client sees them.
--     The current value is the latest outcome_metrics row with the goal's engine and metric as of the
--     end of the cycle; null when nothing measures that metric, and the page then shows no progress.
-- The existing JSON keys are unchanged.
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
    'cycle', jsonb_build_object(
      'id', cur.id, 'cycle_no', cur.cycle_no, 'status', cur.status,
      'start', cur.period_start, 'end', cur_end, 'period_end_nominal', cur.period_end
    ),
    'current', public.cycle_window_metrics(p_client_account_id, cur.period_start, cur_end),
    'previous', case when prev.id is null then null else
      jsonb_build_object('cycle_no', prev.cycle_no, 'metrics', public.cycle_window_metrics(p_client_account_id, prev.period_start, prev_end))
    end,
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'engine', g.engine, 'objective', g.objective, 'metric', g.metric,
        'baseline', g.baseline_value, 'target', g.target_value, 'due', g.due_date,
        'current', (
          select o.value from outcome_metrics o
           where o.client_account_id = g.client_account_id and o.source = g.engine and o.metric = g.metric
             and o.captured_at < cur_end
           order by o.captured_at desc limit 1
        )
      ) order by g.created_at)
      from client_goals g
      where g.client_account_id = p_client_account_id and g.status = 'active'
    ), '[]'::jsonb)
  );
end
$$;

revoke all on function public.cycle_metrics(uuid, uuid) from public, anon;
grant execute on function public.cycle_metrics(uuid, uuid) to authenticated, service_role;
