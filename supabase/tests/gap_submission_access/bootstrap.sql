-- Minimal stand-in for the Supabase pieces the migration depends on.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create type public.app_role as enum ('admin','moderator','user');
create table public.user_roles (user_id uuid, role public.app_role);
create function public.has_role(_user_id uuid, _role public.app_role) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
create table public.client_accounts (id uuid primary key default gen_random_uuid(), email text, business_name text);
create table public.client_portal_users (id uuid primary key default gen_random_uuid(), user_id uuid, client_account_id uuid references public.client_accounts(id));
alter table public.user_roles enable row level security; alter table public.client_accounts enable row level security; alter table public.client_portal_users enable row level security;
