create table public.client_postforme_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.client_accounts(id) on delete cascade not null,
  platform text not null,
  postforme_account_id text not null,
  username text,
  profile_photo_url text,
  status text not null default 'connected',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(client_id, postforme_account_id)
);

alter table public.client_postforme_accounts enable row level security;

create policy "Admins manage postforme accounts"
  on public.client_postforme_accounts for all
  using (public.has_role(auth.uid(), 'admin'::app_role));

create policy "Service role full access postforme accounts"
  on public.client_postforme_accounts for all
  using (true);

alter table public.content_calendar
  add column if not exists postforme_post_id text;
