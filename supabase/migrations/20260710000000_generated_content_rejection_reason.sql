-- Feedback loop: durable place to store why a piece of content was rejected
-- or sent back for changes. content_approvals.feedback is ephemeral (cascades
-- when generated_content is deleted, and not every generated_content row
-- gets a content_approvals row at all -- e.g. admin can reject before ever
-- sending a draft to the client). This column travels with the canonical
-- content record regardless of the approval row's lifecycle, so future
-- generation calls can look back at what didn't work.
ALTER TABLE public.generated_content ADD COLUMN IF NOT EXISTS rejection_reason text NULL;
