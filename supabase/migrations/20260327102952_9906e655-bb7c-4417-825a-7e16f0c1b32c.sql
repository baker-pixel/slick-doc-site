
create table public.client_credentials (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.client_accounts(id) on delete cascade,
  wordpress_url text,
  wordpress_username text,
  wordpress_app_password text,
  created_at timestamptz default now()
);

alter table public.client_credentials enable row level security;

create policy "Admins can manage client_credentials" on public.client_credentials for all using (public.has_role(auth.uid(), 'admin'::app_role));
create policy "Service role full access client_credentials" on public.client_credentials for all using (true);

create table public.client_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.client_accounts(id) on delete cascade,
  platform text not null,
  access_token text,
  token_metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.client_oauth_tokens enable row level security;

create policy "Admins can manage client_oauth_tokens" on public.client_oauth_tokens for all using (public.has_role(auth.uid(), 'admin'::app_role));
create policy "Service role full access client_oauth_tokens" on public.client_oauth_tokens for all using (true);
