-- Company profile builder (Phase C): reads the stored crawl, builds an evidence-checked profile of the
-- business, fills what is empty in the client's record and offers the rest as suggestions.

create table public.company_profile_runs (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.client_accounts(id) on delete cascade,
  crawl_id uuid references public.site_crawls(id) on delete set null,
  status text not null default 'running' check (status in ('running', 'complete', 'failed', 'skipped')),
  -- how the profile was produced: the tool-using agent, a repaired agent run, a forced submit, or markup-only fallback
  path text check (path in ('agent', 'agent_repaired', 'forced', 'fallback')),
  model text,
  turns integer,
  tool_calls integer,
  prompt_tokens integer,
  completion_tokens integer,
  source_hash text,
  pages_read integer,
  -- the verified profile (every claim with its quote and page) and what the checker rejected
  proposal jsonb,
  dropped jsonb,
  -- fields written automatically (they were empty) and how many suggestions were left for the client
  filled text[] not null default '{}',
  suggestions_count integer not null default 0,
  note text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index company_profile_runs_client on public.company_profile_runs (client_account_id, created_at desc);

alter table public.company_profile_runs enable row level security;
create policy "Admins manage company_profile_runs" on public.company_profile_runs for all
  using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));
create policy "Clients read their company_profile_runs" on public.company_profile_runs for select
  using (client_account_id in (select client_account_id from public.client_portal_users where user_id = auth.uid()));

-- The crawl's pages with their full stored text, for the profile builder. Read in pages by the caller.
create or replace function public.site_pages_for_profile(p_crawl uuid)
returns table (
  url text, url_key text, source text, page_type text, status text, http_status integer, final_url text,
  depth integer, title text, signals jsonb, links jsonb, content_text text
)
language sql stable security definer set search_path = public
as $$
  select p.url, p.url_key, p.source, p.page_type, p.status, p.http_status, p.final_url,
         p.depth, p.title, p.signals, p.links, p.content_text
  from public.site_pages p where p.crawl_id = p_crawl order by p.id;
$$;

-- Writes a website-derived profile atomically, under a row lock. The caller has already decided what to fill,
-- but emptiness is re-checked HERE: if the client typed something a moment ago, it wins.
create or replace function public.apply_website_profile(
  p_client uuid, p_summary text, p_industry text, p_fill jsonb, p_suggestions jsonb, p_meta jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  c public.client_accounts%rowtype;
  cp jsonb;
  k text;
  v jsonb;
  filled text[] := '{}';
  allowed constant text[] := array['business_summary', 'target_audience', 'services', 'differentiators', 'location'];
begin
  select * into c from public.client_accounts where id = p_client for update;
  if not found then return jsonb_build_object('filled', '[]'::jsonb, 'error', 'client not found'); end if;
  cp := coalesce(c.context_profile, '{}'::jsonb);

  if p_summary is not null and btrim(p_summary) <> '' and coalesce(btrim(c.website_summary), '') = '' then
    update public.client_accounts set website_summary = p_summary where id = p_client;
    filled := array_append(filled, 'website_summary');
  end if;
  if p_industry is not null and btrim(p_industry) <> '' and coalesce(btrim(c.industry), '') = '' then
    update public.client_accounts set industry = p_industry where id = p_client;
    filled := array_append(filled, 'industry');
  end if;

  for k, v in select * from jsonb_each(coalesce(p_fill, '{}'::jsonb)) loop
    continue when not (k = any(allowed));
    if cp -> k is null or cp -> k = 'null'::jsonb or cp -> k = '[]'::jsonb or cp -> k = '""'::jsonb
       or (jsonb_typeof(cp -> k) = 'string' and btrim(cp ->> k) = '') then
      cp := jsonb_set(cp, array[k], v, true);
      filled := array_append(filled, k);
    end if;
  end loop;

  cp := cp || jsonb_build_object(
    'website_suggestions', coalesce(p_suggestions, '{}'::jsonb),
    'website_profile', coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('filled', to_jsonb(filled))
  );
  update public.client_accounts set context_profile = cp where id = p_client;
  return jsonb_build_object('filled', to_jsonb(filled));
end $$;

revoke all on function public.site_pages_for_profile(uuid) from public, anon, authenticated;
revoke all on function public.apply_website_profile(uuid, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.site_pages_for_profile(uuid) to service_role;
grant execute on function public.apply_website_profile(uuid, text, text, jsonb, jsonb, jsonb) to service_role;
