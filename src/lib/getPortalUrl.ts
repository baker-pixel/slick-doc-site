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

/**
 * Returns the base origin for the marketing site (apex domain, no subdomain).
 * Routes like /gap-analysis only exist there — never build them as relative
 * paths from client./admin. subdomains.
 */
export function getMarketingOrigin(): string {
  const { hostname, protocol } = window.location;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return window.location.origin;
  }

  const parts = hostname.split(".");
  const rootDomain = parts.length > 2 ? parts.slice(1).join(".") : hostname;
  return `${protocol}//${rootDomain}`;
}
