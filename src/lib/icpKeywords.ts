// How a client's ICP search keywords are cleaned and kept across saves. The rules live in one
// shared module (tested in CI with the other _shared helpers) so the portal card and the
// discovery functions agree on what a keyword is.
export {
  icpForSave,
  keywordProblem,
  normalizeKeywords,
  MAX_KEYWORDS,
  type KeywordSource,
} from "../../supabase/functions/_shared/icpKeywords";
