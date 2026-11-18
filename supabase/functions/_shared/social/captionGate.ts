// A post with no real caption must never reach a client's approval queue or
// be approved into the publish queue. Shared so fill-scheduled-content and
// handle-approval agree on what "empty" means.
const MIN_CAPTION_CHARS = 15;

export function isUsableCaption(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (t.length < MIN_CAPTION_CHARS) return false;
  if (/^\[auto-generated placeholder/i.test(t)) return false;
  return true;
}
