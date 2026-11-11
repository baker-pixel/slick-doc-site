// Portal copy of supabase/functions/_shared/pluginVersion.ts. Keep the three in
// sync with the plugin header; supabase/functions/_shared/pluginVersion.test.ts
// fails when they drift.
export const LATEST_PLUGIN_VERSION = "1.3.0";
export const PLUGIN_DOWNLOAD_URL = "/downloads/orange-door.zip";

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
