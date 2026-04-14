ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS context_profile JSONB,
  ADD COLUMN IF NOT EXISTS submission_id UUID REFERENCES gap_analysis_submissions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_submission_id ON prospects(submission_id);
CREATE INDEX IF NOT EXISTS idx_prospects_email ON prospects(email);

ALTER TABLE gap_analysis_submissions
  ADD COLUMN IF NOT EXISTS context_profile JSONB;

ALTER TABLE client_accounts
  ADD COLUMN IF NOT EXISTS context_profile JSONB;