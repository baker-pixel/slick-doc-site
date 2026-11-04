-- Background site crawler (Phase A). A crawl is a durable, resumable job: a worker
-- (process-site-crawl, run every minute by pg_cron) claims one crawl with a lease,
-- crawls for a bounded time, saves every page and its signals, releases the lease and
-- is called again. Progress is just these rows, so the UI can show "84 of 212 pages".

create table public.site_crawls (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.client_accounts(id) on delete cascade,
  origin text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'complete', 'failed', 'cancelled')),
  phase text not null default 'seed' check (phase in ('seed', 'crawl', 'done')),
  trigger text not null default 'manual',
  max_pages integer not null check (max_pages between 1 and 5000),
  pages_discovered integer not null default 0,
  pages_crawled integer not null default 0,
  pages_failed integer not null default 0,
  error text,
  config jsonb not null default '{}'::jsonb,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  last_step_at timestamptz,
  finished_at timestamptz
);

-- One active crawl per client: starting a second one returns the running one.
create unique index site_crawls_one_active_per_client
  on public.site_crawls (client_account_id) where status in ('queued', 'running');
create index site_crawls_client_recent on public.site_crawls (client_account_id, created_at desc);
create index site_crawls_active on public.site_crawls (status, claimed_at) where status in ('queued', 'running');

create table public.site_pages (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid not null references public.site_crawls(id) on delete cascade,
  client_account_id uuid not null references public.client_accounts(id) on delete cascade,
  url text not null,
  url_key text not null,
  path_key text not null,
  depth integer not null default 0,
  source text not null check (source in ('seed', 'sitemap', 'link')),
  page_type text not null default 'other',
  priority integer not null default 500,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed', 'skipped')),
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  http_status integer,
  final_url text,
  fetched_via text check (fetched_via in ('plain', 'render')),
  content_type text,
  error text,
  title text,
  signals jsonb,
  links jsonb,
  content_text text,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  -- a real table constraint (not a partial index) so upsert ... ignoreDuplicates works
  constraint site_pages_crawl_key_unique unique (crawl_id, url_key)
);
create index site_pages_queue on public.site_pages (crawl_id, status, priority, depth);
create index site_pages_path on public.site_pages (crawl_id, path_key);
create index site_pages_client on public.site_pages (client_account_id, crawl_id);

alter table public.site_crawls enable row level security;
alter table public.site_pages enable row level security;

create policy "Admins manage site_crawls" on public.site_crawls for all
  using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));
create policy "Clients read their site_crawls" on public.site_crawls for select
  using (client_account_id in (select client_account_id from public.client_portal_users where user_id = auth.uid()));
create policy "Admins manage site_pages" on public.site_pages for all
  using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));
create policy "Clients read their site_pages" on public.site_pages for select
  using (client_account_id in (select client_account_id from public.client_portal_users where user_id = auth.uid()));
-- No other policies: the edge functions use the service role, which bypasses RLS.

-- ── worker RPCs (service role only) ─────────────────────────────────────────

-- Claims the least-recently-stepped active crawl whose lease is free or expired.
create or replace function public.claim_site_crawl(p_lease_seconds integer default 150)
returns setof public.site_crawls
language sql security definer set search_path = public
as $$
  with c as (
    select id from public.site_crawls
    where status in ('queued', 'running')
      and (claimed_at is null or claimed_at < now() - make_interval(secs => p_lease_seconds))
    order by coalesce(last_step_at, created_at) asc
    limit 1
    for update skip locked
  )
  update public.site_crawls s set claimed_at = now()
  from c where s.id = c.id
  returning s.*;
$$;

create or replace function public.site_crawl_counts(p_crawl uuid)
returns table (total bigint, pending bigint, done bigint, failed bigint, skipped bigint)
language sql stable security definer set search_path = public
as $$
  select count(*),
         count(*) filter (where status = 'pending'),
         count(*) filter (where status = 'done'),
         count(*) filter (where status = 'failed'),
         count(*) filter (where status = 'skipped')
  from public.site_pages where crawl_id = p_crawl;
$$;

create or replace function public.site_pages_existing_keys(p_crawl uuid, p_keys text[])
returns table (url_key text)
language sql stable security definer set search_path = public
as $$ select p.url_key from public.site_pages p where p.crawl_id = p_crawl and p.url_key = any(p_keys); $$;

create or replace function public.site_pages_path_counts(p_crawl uuid, p_paths text[])
returns table (path_key text, n bigint)
language sql stable security definer set search_path = public
as $$
  select p.path_key, count(*) from public.site_pages p
  where p.crawl_id = p_crawl and p.path_key = any(p_paths) group by p.path_key;
$$;

-- What a finished crawl found, by page type, for the progress card.
create or replace function public.site_crawl_breakdown(p_crawl uuid)
returns table (page_type text, pages bigint, errors bigint, noindex bigint)
language sql stable security definer set search_path = public
as $$
  select page_type, count(*),
         count(*) filter (where http_status >= 400 or status = 'failed'),
         count(*) filter (where (signals->>'noindex')::boolean is true)
  from public.site_pages where crawl_id = p_crawl group by page_type order by 2 desc;
$$;

revoke all on function public.claim_site_crawl(integer) from public, anon, authenticated;
revoke all on function public.site_crawl_counts(uuid) from public, anon, authenticated;
revoke all on function public.site_pages_existing_keys(uuid, text[]) from public, anon, authenticated;
revoke all on function public.site_pages_path_counts(uuid, text[]) from public, anon, authenticated;
revoke all on function public.site_crawl_breakdown(uuid) from public, anon, authenticated;
grant execute on function public.claim_site_crawl(integer) to service_role;
grant execute on function public.site_crawl_counts(uuid) to service_role;
grant execute on function public.site_pages_existing_keys(uuid, text[]) to service_role;
grant execute on function public.site_pages_path_counts(uuid, text[]) to service_role;
grant execute on function public.site_crawl_breakdown(uuid) to service_role;
