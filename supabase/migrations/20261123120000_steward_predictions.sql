-- Steward feedback loop: a proposal can carry a testable prediction, and is
-- scored (hit / miss / inconclusive) against the next audit after its check date.
ALTER TABLE public.agent_proposals
  ADD COLUMN IF NOT EXISTS prediction jsonb,
  ADD COLUMN IF NOT EXISTS outcome jsonb,
  ADD COLUMN IF NOT EXISTS outcome_status text CHECK (outcome_status IN ('hit', 'miss', 'inconclusive')),
  ADD COLUMN IF NOT EXISTS scored_at timestamptz;

-- The scorer looks for approved, predicted, not-yet-scored proposals.
CREATE INDEX IF NOT EXISTS agent_proposals_unscored_idx
  ON public.agent_proposals (client_account_id)
  WHERE prediction IS NOT NULL AND scored_at IS NULL;
