-- Idempotency guards (eng-review fix IDEM-1, wave 3).
--
-- 1. email_queue: one row per (sequence, prospect, drip step). run-prospect-drip checks
--    "is this step already queued?" and then inserts; two overlapping hourly runs (or a manual
--    run) both pass the check and queued the step twice. The unique index makes the second
--    insert fail with 23505, which the function now treats as "already queued".
--    NOT a partial index on purpose: rows without these keys (every other kind of email)
--    have NULLs, and unique indexes allow repeated NULLs. Checked against live data on
--    2026-11-26: 0 duplicate groups, so this creates cleanly. If it ever fails, there are
--    duplicates to resolve first; do not delete blindly.
create unique index if not exists email_queue_prospect_step_uniq
  on public.email_queue (
    (metadata ->> 'prospect_id'),
    (metadata ->> 'drip_step'),
    (metadata ->> 'sequence_id')
  );

-- 2. Atomic per-slot lease for fill-scheduled-content. One statement flips the lease, so
--    two overlapping runs cannot both draft (and pay for) the same slot. The lease expires
--    after p_ttl, so a crashed run does not strand the slot. Returns true when THIS caller
--    now holds the lease.
create or replace function public.claim_content_slot(p_id uuid, p_ttl interval default interval '10 minutes')
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  with claimed as (
    update public.content_calendar
       set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('draft_claimed_at', now())
     where id = p_id
       and (
         metadata ->> 'draft_claimed_at' is null
         or (metadata ->> 'draft_claimed_at')::timestamptz < now() - p_ttl
       )
    returning 1
  )
  select exists (select 1 from claimed)
$$;

revoke all on function public.claim_content_slot(uuid, interval) from public, anon, authenticated;
grant execute on function public.claim_content_slot(uuid, interval) to service_role;

-- NOT done here (needs a decision): a UNIQUE constraint on content_calendar
-- (client_account_id, platform, scheduled_for) to stop auto-schedule-content creating the
-- same slot twice. As of 2026-11-26 the live table has 1 existing duplicate pair, so the
-- constraint would fail to create until that pair is resolved by a person.
