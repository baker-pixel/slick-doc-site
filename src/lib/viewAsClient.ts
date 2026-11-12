// "View as client": an admin opens a client's portal read-only. The portal runs
// as the admin's own session (nothing is impersonated), and while this mode is
// on, every Supabase request that could change data is refused here, in one
// place, so no tab, button or background effect in the portal can write.
//
// Reads (GET/HEAD) always pass. POST-based reads must be listed below; anything
// not listed is blocked by default, so a new write path is safe until someone
// deliberately allows it.

let viewAsActive = false;

export function setViewAsActive(active: boolean) {
  viewAsActive = active;
}

export function isViewAsActive(): boolean {
  return viewAsActive;
}

export const VIEW_ONLY_MESSAGE = "Read-only view: changes are disabled while viewing as a client.";

/** Postgres functions called via rpc() that only read. */
const READ_ONLY_RPCS = new Set(["client_campaign_stats", "client_outreach_stats", "has_role"]);

/** Edge functions the portal calls that only read. */
const READ_ONLY_FUNCTIONS = new Set(["get-live-analytics"]);

/** Storage endpoints that use POST but only read (signed URLs, listings, metadata). */
const READ_ONLY_STORAGE_PREFIXES = [
  "/storage/v1/object/sign/",
  "/storage/v1/object/list/",
  "/storage/v1/object/info/",
];

/** True when a request would change data and must be refused in view-as mode. */
export function isBlockedInViewAs(method: string, url: string, supabaseUrl: string): boolean {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false; // not an absolute URL: not a Supabase call we can classify
  }
  if (parsed.origin !== new URL(supabaseUrl).origin) return false; // third-party request, not ours to police

  const path = parsed.pathname;
  if (path.startsWith("/auth/v1/")) return false; // token refresh etc.
  if (READ_ONLY_STORAGE_PREFIXES.some((p) => path.startsWith(p))) return false;

  const rpc = path.match(/^\/rest\/v1\/rpc\/([^/]+)$/);
  if (rpc) return !READ_ONLY_RPCS.has(rpc[1]);

  const fn = path.match(/^\/functions\/v1\/([^/]+)/);
  if (fn) return !READ_ONLY_FUNCTIONS.has(fn[1]);

  return true; // table writes, storage uploads/deletes, anything unrecognised
}

/** fetch wrapper for the Supabase client: refuses writes while view-as is on. */
export function createViewAsFetch(supabaseUrl: string): typeof fetch {
  return async (input, init) => {
    if (viewAsActive) {
      const req = input instanceof Request ? input : null;
      const method = init?.method ?? req?.method ?? "GET";
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (req?.url ?? "");
      if (isBlockedInViewAs(method, url, supabaseUrl)) {
        return new Response(
          JSON.stringify({ error: VIEW_ONLY_MESSAGE, message: VIEW_ONLY_MESSAGE, code: "VIEW_ONLY" }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
    }
    return fetch(input, init);
  };
}

/** Path of the view-as page for a client; keeps ?app=admin when developing on localhost. */
export function viewAsClientPath(clientId: string): string {
  const app = new URLSearchParams(window.location.search).get("app");
  return `/view-as/${clientId}${app ? `?app=${encodeURIComponent(app)}` : ""}`;
}
