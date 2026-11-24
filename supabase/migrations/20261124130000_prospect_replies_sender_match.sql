-- Replies are tied to a prospect by the tracking id in the Reply-To address, not
-- by who sent them. A forward or a colleague's reply carries the same tag, so
-- record whether the sender actually is the prospect we emailed.
-- NULL = unknown (no prospect or no parseable sender), e.g. all pre-existing rows.
ALTER TABLE public.prospect_replies
  ADD COLUMN IF NOT EXISTS sender_matches_prospect boolean;
