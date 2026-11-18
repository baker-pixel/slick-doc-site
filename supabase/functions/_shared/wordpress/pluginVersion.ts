// The newest Orange Door WordPress plugin version we ship. Three places must
// agree (pluginVersion.test.ts fails if they drift):
//   * wp-plugin/orangedoor.php   -> "Version:" header and OD_PLUGIN_VERSION
//   * this file                  -> LATEST_PLUGIN_VERSION
//   * src/lib/pluginVersion.ts   -> LATEST_PLUGIN_VERSION (the portal's copy)
export const LATEST_PLUGIN_VERSION = "1.3.0";

// First version whose footer script reports visitors. Older plugins connect and
// scan fine but can never send traffic, so the portal asks the client to update.
export const MIN_TRACKING_VERSION = "1.3.0";

/** Numeric dotted-version compare. Missing parts count as 0; junk parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** True when the site's plugin is older than the one we ship (or its version is unknown). */
export function pluginNeedsUpdate(version: string | null | undefined): boolean {
  if (!version) return true;
  return compareVersions(version, LATEST_PLUGIN_VERSION) < 0;
}

/** True when the site's plugin can send visitor data. */
export function pluginSupportsTracking(version: string | null | undefined): boolean {
  if (!version) return false;
  return compareVersions(version, MIN_TRACKING_VERSION) >= 0;
}
