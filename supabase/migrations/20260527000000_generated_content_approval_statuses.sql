-- Add client_approved and changes_requested to generated_content status constraint.
-- client_approved: client confirmed via content_approvals; queued for publishing.
-- changes_requested: client requested edits; content needs revision.

ALTER TABLE public.generated_content
  DROP CONSTRAINT IF EXISTS generated_content_status_check;

ALTER TABLE public.generated_content
  ADD CONSTRAINT generated_content_status_check
    CHECK (status IN (
      'draft',
      'pending_admin_review',
      'approved',
      'rejected',
      'client_approved',
      'changes_requested',
      'published',
      'archived'
    ));
