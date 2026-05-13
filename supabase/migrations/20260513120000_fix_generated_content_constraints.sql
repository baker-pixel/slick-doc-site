-- Widen generated_content constraints to support the safe admin-review pipeline.
--
-- status: add pending_admin_review (cron drafts awaiting admin) and rejected.
-- content_type: add email_copy (used by fill-scheduled-content for email slots).

ALTER TABLE public.generated_content
  DROP CONSTRAINT IF EXISTS generated_content_status_check;

ALTER TABLE public.generated_content
  ADD CONSTRAINT generated_content_status_check
    CHECK (status IN ('draft', 'pending_admin_review', 'approved', 'rejected', 'published', 'archived'));

ALTER TABLE public.generated_content
  DROP CONSTRAINT IF EXISTS generated_content_content_type_check;

ALTER TABLE public.generated_content
  ADD CONSTRAINT generated_content_content_type_check
    CHECK (content_type IN ('email', 'email_copy', 'blog_post', 'social_post', 'ad_copy', 'report', 'other'));
