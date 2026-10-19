// Notifications share one table: real marketing wins (ranking, traffic, ...)
// and system updates/alerts (blockers, replies, status). Only wins get the
// trophy/confetti treatment.
const UPDATE_TYPES = new Set([
  "integration_disconnected",
  "integration_needs_reauth",
  "prospect_reply",
  "brand_assets_ready",
  "brand_assets_none",
  "project_comment_reply",
]);

const ACTION_TYPES = new Set(["integration_disconnected", "integration_needs_reauth"]);

export function isWinNotification(n: { notification_type: string; is_positive: boolean }): boolean {
  return n.is_positive !== false && !UPDATE_TYPES.has(n.notification_type);
}

export function needsAction(n: { notification_type: string }): boolean {
  return ACTION_TYPES.has(n.notification_type);
}
