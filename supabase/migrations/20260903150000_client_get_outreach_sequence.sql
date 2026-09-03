-- Lets the client portal show the outreach campaign's shape (step count,
-- spacing) up front, instead of clients only discovering what's being sent
-- on their behalf after each email actually goes out.
--
-- email_sequences only grants "Service role can manage" (see run-prospect-drip
-- and prior client_get_prospect_* RPCs), so this follows the same
-- SECURITY DEFINER pattern: any authenticated portal user can call it,
-- since the sequence shape (delay days per step) is the same for every
-- client, not per-client data.
CREATE OR REPLACE FUNCTION public.client_get_outreach_sequence()
RETURNS TABLE (
  step_number     INT,
  delay_days      INT,
  cumulative_days INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM client_portal_users WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  WITH sequence_row AS (
    SELECT emails
    FROM email_sequences
    WHERE trigger_type = 'prospect_outreach'
      AND is_active = true
      AND tier IS NULL
    LIMIT 1
  ),
  steps AS (
    SELECT
      ROW_NUMBER() OVER () AS step_number,
      COALESCE((e->>'delay_days')::INT, 0) AS delay_days
    FROM sequence_row, jsonb_array_elements(sequence_row.emails) e
  )
  SELECT
    step_number,
    delay_days,
    SUM(delay_days) OVER (ORDER BY step_number)::INT AS cumulative_days
  FROM steps
  ORDER BY step_number;
END;
$$;

REVOKE ALL ON FUNCTION public.client_get_outreach_sequence FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_get_outreach_sequence TO authenticated;
