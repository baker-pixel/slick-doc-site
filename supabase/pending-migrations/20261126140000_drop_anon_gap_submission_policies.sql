-- Lead table lockdown, part 2 of 2: DESTRUCTIVE. Do NOT put this in supabase/migrations/ until
-- the new frontend is live.
--
-- Why it lives here: `supabase db push` applies every pending file in migrations/, and the OLD
-- frontend (the build before wave 4) reads and writes gap_analysis_submissions directly with
-- the anon key. Dropping these policies first makes the public Gap Analysis form, the resume
-- links and the report pages fail for real visitors.
--
-- Order of operations:
--   1. apply supabase/migrations/20261126130000_gap_submission_access.sql   (additive)
--   2. deploy the frontend that calls the RPCs (create_gap_submission, ...)
--   3. smoke test in the live app: submit the form, resume via the emailed link,
--      open the report link, open the admin leads screens
--   4. THEN move this file into supabase/migrations/ and apply it
-- Rollback: recreate the four policies below (their original definitions are in this file's
-- comments) and the old frontend works again.
--
-- Original definitions, for rollback:
--   create policy "Anyone can submit gap analysis" on public.gap_analysis_submissions for insert to public with check (true);
--   create policy "Anyone can view completed reports by ID" on public.gap_analysis_submissions for select to public using (status = 'submitted' and completed_at is not null);
--   create policy "Anyone can view their submission by resume token" on public.gap_analysis_submissions for select to public using (resume_token is not null);
--   create policy "Anyone can update their own submission by id" on public.gap_analysis_submissions for update to public using (true);

drop policy if exists "Anyone can submit gap analysis" on public.gap_analysis_submissions;
drop policy if exists "Anyone can view completed reports by ID" on public.gap_analysis_submissions;
drop policy if exists "Anyone can view their submission by resume token" on public.gap_analysis_submissions;
drop policy if exists "Anyone can update their own submission by id" on public.gap_analysis_submissions;
