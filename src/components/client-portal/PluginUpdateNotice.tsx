import { Button } from "@/components/ui/button";
import { ArrowUpCircle, Download } from "lucide-react";
import { LATEST_PLUGIN_VERSION, PLUGIN_DOWNLOAD_URL } from "@/lib/pluginVersion";

interface PluginUpdateNoticeProps {
  currentVersion: string | null | undefined;
  /** "client": step-by-step instructions for the site owner. "admin": a short heads-up for our team. */
  audience?: "client" | "admin";
  /** Mention that the update is what unlocks live visitor numbers (shown on the Analytics tab). */
  forVisitorStats?: boolean;
}

// Shown wherever a connected site runs an older Orange Door plugin than the one
// we ship. Updating is manual (no auto-update yet): download the zip, upload it
// over the old plugin in WordPress, activate. Uploading over an active plugin
// keeps it active, and the new version re-registers itself with the dashboard on
// the next wp-admin page load, so no re-pairing is needed.
export function PluginUpdateNotice({ currentVersion, audience = "client", forVisitorStats = false }: PluginUpdateNoticeProps) {
  const running = currentVersion ? `version ${currentVersion}` : "an older version";

  if (audience === "admin") {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex flex-wrap items-center justify-between gap-2">
        <span>
          Plugin {currentVersion ? `v${currentVersion}` : "version unknown"} is out of date (latest v{LATEST_PLUGIN_VERSION}).
          The client has to upload and activate the new plugin on their site; until then they get no visitor numbers.
        </span>
        <a href={PLUGIN_DOWNLOAD_URL} download="orange-door.zip" className="inline-flex items-center gap-1 font-medium hover:underline">
          <Download className="h-3 w-3" /> Download v{LATEST_PLUGIN_VERSION}
        </a>
      </div>
    );
  }

  return (
    <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/15 shrink-0">
          <ArrowUpCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-foreground">A new version of the Orange Door plugin is available</h3>
          <p className="text-sm text-muted-foreground">
            Your website is running {running}.
            {forVisitorStats
              ? ` Version ${LATEST_PLUGIN_VERSION} adds live visitor numbers to this page, so install it to start seeing who is on your site.`
              : ` Version ${LATEST_PLUGIN_VERSION} adds live visitor numbers to your dashboard and keeps everything else working as before.`}
          </p>
        </div>
      </div>

      <ol className="list-decimal pl-6 space-y-1.5 text-sm text-foreground">
        <li>
          Download the new plugin file.{" "}
          <Button asChild size="sm" variant="outline" className="h-7 text-xs ml-1">
            <a href={PLUGIN_DOWNLOAD_URL} download="orange-door.zip">
              <Download className="h-3 w-3 mr-1" /> Download v{LATEST_PLUGIN_VERSION}
            </a>
          </Button>
        </li>
        <li>In your WordPress admin, go to <span className="font-medium">Plugins → Add New → Upload Plugin</span>, choose the file, and click <span className="font-medium">Install Now</span>.</li>
        <li>If WordPress says the plugin already exists, choose <span className="font-medium">Replace current with uploaded</span>.</li>
        <li>Click <span className="font-medium">Activate Plugin</span> (if WordPress doesn't show the button, it is already active).</li>
      </ol>

      <p className="text-xs text-muted-foreground">
        Your connection and settings stay as they are. This page updates by itself within a minute of you opening any WordPress admin page.
        If you see two "Orange Door SEO" plugins listed afterward, deactivate and delete the older one.
      </p>
    </div>
  );
}
