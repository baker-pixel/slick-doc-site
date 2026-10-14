// SYSTEM Scorecard (S, Y, S2, T, E, M) for the Gap Analysis form.
// The formula lives in ONE place, shared with the generate-analysis edge function,
// so the on-screen report, admin view, emailed PDF and stored score always agree.
export {
  calculateSystemScorecard,
  getStatusBadgeColor,
  GAP_SCORE_VERSION,
  type SystemScore,
  type SystemScorecard,
} from "../../supabase/functions/_shared/gapScore";
