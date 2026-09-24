const PLACEHOLDER_PREFIX = "[Auto-generated placeholder";

// Matches the row auto-schedule-content inserts before fill-scheduled-content
// writes real AI copy over it (see supabase/functions/auto-schedule-content
// and fill-scheduled-content). Never show this text to anyone.
export function isPlaceholderContent(content: string | null | undefined): boolean {
  const trimmed = content?.trim() ?? "";
  return !trimmed || trimmed.startsWith(PLACEHOLDER_PREFIX);
}
