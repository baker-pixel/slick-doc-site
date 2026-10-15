-- Phase B: audits run on the stored crawl, and re-crawls only re-read what changed.

alter table public.site_pages
  add column etag text,
  add column last_modified text,
  add column sitemap_lastmod text;

alter table public.site_crawls
  add column previous_crawl_id uuid references public.site_crawls(id) on delete set null,
  add column mode text not null default 'full' check (mode in ('full', 'incremental')),
  -- true when the crawl was started to feed an audit: the worker queues the audit when it completes
  add column run_audit boolean not null default false,
  add column audit_enqueued_at timestamptz;

-- What the previous crawl knew about these URLs (for conditional requests and carrying unchanged pages forward).
create or replace function public.site_pages_previous(p_crawl uuid, p_keys text[])
returns table (
  url_key text, status text, etag text, last_modified text, http_status integer, final_url text, fetched_via text,
  content_type text, title text, signals jsonb, links jsonb, content_text text, fetched_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select p.url_key, p.status, p.etag, p.last_modified, p.http_status, p.final_url, p.fetched_via,
         p.content_type, p.title, p.signals, p.links, p.content_text, p.fetched_at
  from public.site_pages p where p.crawl_id = p_crawl and p.url_key = any(p_keys);
$$;
revoke all on function public.site_pages_previous(uuid, text[]) from public, anon, authenticated;
grant execute on function public.site_pages_previous(uuid, text[]) to service_role;

-- Keep the three most recent finished crawls per client; older ones (and their pages) are dropped.
create or replace function public.prune_site_crawls(p_client uuid, p_keep integer default 3)
returns integer
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  with old as (
    select id from public.site_crawls
    where client_account_id = p_client and status in ('complete', 'failed', 'cancelled')
    order by created_at desc offset greatest(p_keep, 1)
  )
  delete from public.site_crawls c using old where c.id = old.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.prune_site_crawls(uuid, integer) from public, anon, authenticated;
grant execute on function public.prune_site_crawls(uuid, integer) to service_role;

-- The audit's view of a crawl: only the columns it needs, with the text cut to what it uses (the
-- stored content is longer, for the company-profile step). Read in pages by the caller.
create or replace function public.site_pages_for_audit(p_crawl uuid)
returns table (
  url text, url_key text, source text, page_type text, status text, http_status integer, final_url text,
  fetched_via text, depth integer, signals jsonb, links jsonb, text_sample text
)
language sql stable security definer set search_path = public
as $$
  select p.url, p.url_key, p.source, p.page_type, p.status, p.http_status, p.final_url,
         p.fetched_via, p.depth, p.signals, p.links, left(p.content_text, 1500)
  from public.site_pages p where p.crawl_id = p_crawl order by p.id;
$$;
revoke all on function public.site_pages_for_audit(uuid) from public, anon, authenticated;
grant execute on function public.site_pages_for_audit(uuid) to service_role;
