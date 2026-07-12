-- Expired unapproved posts: a draft slot whose scheduled date passed >1 day
-- ago will never publish (publish requires status='scheduled' +
-- client_approved), so it's dead weight — it clutters the client approval
-- inbox and fill-scheduled-content kept re-drafting past-due placeholders.
-- Policy (user decision 2026-07-13): fully delete after a 1-day grace period.
--
-- FK topology: generated_content is the parent; content_calendar.content_id
-- and content_approvals.content_id both cascade on its deletion. Placeholder
-- slots have no content_id and are deleted from content_calendar directly.
-- generated_content rows in rejected/changes_requested are preserved: their
-- rejection_reason feeds the negative-feedback prompt loop in
-- fill-scheduled-content.

-- Daily sweep at 03:30 UTC, before the 07:00 fill run. SQL-only cron,
-- mirroring cleanup-agent-job-dedupe.
SELECT cron.schedule(
  'cleanup-expired-draft-content',
  '30 3 * * *',
  $$
  DELETE FROM public.generated_content
  WHERE id IN (
    SELECT content_id FROM public.content_calendar
    WHERE status = 'draft' AND client_approved = false
      AND scheduled_for < now() - interval '1 day'
      AND content_id IS NOT NULL
  )
  AND status NOT IN ('rejected', 'changes_requested', 'approved', 'client_approved', 'published');

  DELETE FROM public.content_calendar
  WHERE status = 'draft' AND client_approved = false
    AND scheduled_for < now() - interval '1 day';
  $$
);

-- One-time backlog purge: apply the same rule to the rows that already
-- expired before this shipped.
DELETE FROM public.generated_content
WHERE id IN (
  SELECT content_id FROM public.content_calendar
  WHERE status = 'draft' AND client_approved = false
    AND scheduled_for < now() - interval '1 day'
    AND content_id IS NOT NULL
)
AND status NOT IN ('rejected', 'changes_requested', 'approved', 'client_approved', 'published');

DELETE FROM public.content_calendar
WHERE status = 'draft' AND client_approved = false
  AND scheduled_for < now() - interval '1 day';
