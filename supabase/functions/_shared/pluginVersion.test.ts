import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  compareVersions,
  LATEST_PLUGIN_VERSION,
  MIN_TRACKING_VERSION,
  pluginNeedsUpdate,
  pluginSupportsTracking,
} from "./pluginVersion.ts";

Deno.test("compareVersions: numeric, not string, ordering", () => {
  assertEquals(compareVersions("1.10.0", "1.9.0"), 1); // string compare would get this wrong
  assertEquals(compareVersions("1.2.0", "1.2"), 0);
  assertEquals(compareVersions("1.1.1", "1.2.0"), -1);
  assertEquals(compareVersions("2.0.0", "1.99.99"), 1);
  assertEquals(compareVersions("1.3.0", "1.3.0"), 0);
});

Deno.test("pluginNeedsUpdate: every version the clients actually run is flagged; current is not", () => {
  assert(pluginNeedsUpdate("1.0.0")); // Strattomedia
  assert(pluginNeedsUpdate("1.1.1")); // Innermetrix
  assert(pluginNeedsUpdate("1.2.0")); // Resonant
  assert(!pluginNeedsUpdate(LATEST_PLUGIN_VERSION));
  assert(!pluginNeedsUpdate("9.9.9"));
  assert(pluginNeedsUpdate(null));
  assert(pluginNeedsUpdate(undefined));
  assert(pluginNeedsUpdate(""));
});

Deno.test("pluginSupportsTracking: only 1.3.0+ can send visitors", () => {
  assert(!pluginSupportsTracking("1.2.0"));
  assert(!pluginSupportsTracking(null));
  assert(pluginSupportsTracking(MIN_TRACKING_VERSION));
  assert(pluginSupportsTracking("1.4.0"));
});

// The three copies of "what is the newest plugin" must agree, or the portal
// would nag clients to update to a version that is already current (or not
// nag at all). Reads the real files, so it fails in CI the moment one is bumped alone.
Deno.test("plugin version agrees across the plugin file, the backend and the portal", async () => {
  const plugin = await Deno.readTextFile(new URL("../../../wp-plugin/orangedoor.php", import.meta.url));
  const portal = await Deno.readTextFile(new URL("../../../src/lib/pluginVersion.ts", import.meta.url));
  const header = plugin.match(/^\s*\*\s*Version:\s*([\d.]+)/m)?.[1];
  const constant = plugin.match(/define\(\s*'OD_PLUGIN_VERSION',\s*'([\d.]+)'/)?.[1];
  const portalVersion = portal.match(/LATEST_PLUGIN_VERSION\s*=\s*"([\d.]+)"/)?.[1];
  assertEquals(header, LATEST_PLUGIN_VERSION, "plugin header Version");
  assertEquals(constant, LATEST_PLUGIN_VERSION, "plugin OD_PLUGIN_VERSION");
  assertEquals(portalVersion, LATEST_PLUGIN_VERSION, "src/lib/pluginVersion.ts");
  // and the file people download is the same plugin
  const published = await Deno.readTextFile(new URL("../../../public/downloads/orange-door.php", import.meta.url));
  assertEquals(published, plugin, "public/downloads/orange-door.php is stale; recopy it and rebuild the zip");
});
