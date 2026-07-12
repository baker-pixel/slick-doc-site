-- Follow-up to cleanup_expired_drafts: the backlog purge exposed 148 pending
-- content_approvals rows whose calendar slot no longer exists (manual draft
-- deletes and legacy paths remove the slot but not the approval row; 145 of
-- them point at content that was already approved elsewhere). They can never
-- publish and only clutter the client approval inbox.
--
-- Rule: a *pending* approval with no calendar slot and a 1-day grace is dead.
-- Only status='pending' is touched — onboarding intro-post approvals use
-- 'pending_review' and legitimately have no calendar slot.
-- Deleting content_approvals rows never cascades anywhere (it is a leaf).

-- Re-register the daily sweep with the orphan statement added
-- (cron.schedule upserts by jobname).
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

  DELETE FROM public.content_approvals a
  WHERE a.status = 'pending'
    AND a.created_at < now() - interval '1 day'
    AND NOT EXISTS (
      SELECT 1 FROM public.content_calendar cc WHERE cc.content_id = a.content_id
    );
  $$
);

-- One-time purge of the existing orphans.
DELETE FROM public.content_approvals a
WHERE a.status = 'pending'
  AND a.created_at < now() - interval '1 day'
  AND NOT EXISTS (
    SELECT 1 FROM public.content_calendar cc WHERE cc.content_id = a.content_id
  );
