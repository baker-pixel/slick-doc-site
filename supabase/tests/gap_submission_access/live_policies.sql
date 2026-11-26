-- The four policies exactly as they are live today.
alter table public.gap_analysis_submissions enable row level security;
create policy "Anyone can submit gap analysis" on public.gap_analysis_submissions for insert to public with check (true);
create policy "Anyone can view completed reports by ID" on public.gap_analysis_submissions for select to public using (status = 'submitted' and completed_at is not null);
create policy "Anyone can view their submission by resume token" on public.gap_analysis_submissions for select to public using (resume_token is not null);
create policy "Anyone can update their own submission by id" on public.gap_analysis_submissions for update to public using (true);
grant usage on schema public, auth to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
