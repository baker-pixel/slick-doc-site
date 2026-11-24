// Health of a connected WordPress site, from what we actually know about it.
// v2 (agent) sites check in about every 5 minutes, so silence means something.
// v1 sites never check in, so we cannot claim they are healthy or unhealthy.

export type SiteHealth = "healthy" | "slow" | "silent" | "never" | "legacy" | "disconnected" | "pending";

export interface SiteHealthInput {
  agent_mode: string;
  status: string;
  last_heartbeat_at: string | null;
}

export const HEALTHY_MINUTES = 15;   // 3 missed check-ins
export const SILENT_MINUTES = 60;

export function siteHealth(s: SiteHealthInput, now: number = Date.now()): SiteHealth {
  if (s.status === "disconnected") return "disconnected";
  if (s.status === "pending") return "pending";
  if (s.agent_mode !== "agent") return "legacy";
  if (!s.last_heartbeat_at) return "never";
  const minutes = (now - new Date(s.last_heartbeat_at).getTime()) / 60_000;
  if (minutes <= HEALTHY_MINUTES) return "healthy";
  if (minutes <= SILENT_MINUTES) return "slow";
  return "silent";
}

export const HEALTH_LABEL: Record<SiteHealth, string> = {
  healthy: "Healthy",
  slow: "Slow to check in",
  silent: "Silent",
  never: "Never checked in",
  legacy: "Old plugin (no check-ins)",
  disconnected: "Disconnected",
  pending: "Waiting for plugin",
};

/** Sites that need a person to look at them. */
export function needsAttention(h: SiteHealth): boolean {
  return h === "silent" || h === "never" || h === "slow";
}
