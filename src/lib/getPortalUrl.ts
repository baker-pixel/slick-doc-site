/**
 * Returns the base origin for the client portal.
 * On production replaces any subdomain (or bare domain) with client.
 * On localhost returns same origin so dev works without subdomains.
 */
export function getClientPortalOrigin(): string {
  const { hostname, protocol } = window.location;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return window.location.origin;
  }

  // Strip existing subdomain (if any) and prepend "client"
  const parts = hostname.split(".");
  const rootDomain = parts.length > 2 ? parts.slice(1).join(".") : hostname;
  return `${protocol}//client.${rootDomain}`;
}
