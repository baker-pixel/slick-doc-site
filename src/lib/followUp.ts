// The follow-up questions and their scoring live in one shared module (also used by the
// submit-followup edge function), so what the visitor is asked is exactly what is scored.
export {
  FOLLOW_UP_QUESTIONS,
  visibleQuestions,
  validateAnswers,
  scoreFollowUp,
  fullOverallScore,
  type FollowUpAnswers,
  type FollowUpQuestion,
  type FollowUpScores,
} from "../../supabase/functions/_shared/followUp";
