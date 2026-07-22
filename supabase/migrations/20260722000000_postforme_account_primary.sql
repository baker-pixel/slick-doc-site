alter table public.client_postforme_accounts
  add column if not exists is_primary boolean not null default false;

-- Only one primary account per client+platform (multiple non-primary rows are fine).
create unique index if not exists client_postforme_accounts_one_primary
  on public.client_postforme_accounts (client_id, platform)
  where is_primary;
