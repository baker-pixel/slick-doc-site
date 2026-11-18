// Guards a visitor-supplied URL before the server fetches it (SSRF): only
// public http(s) websites, never localhost, private ranges or cloud metadata.

const PRIVATE_V4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // carrier-grade NAT
];

export function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  if (u.port && !["80", "443", ""].includes(u.port)) return false;

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost")) return false;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home.arpa")) return false;

  // IPv6 literals: block loopback, unique-local, link-local and v4-mapped.
  if (host.includes(":")) {
    return !(host === "::1" || host === "::" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith("::ffff:"));
  }
  // IPv4 literals (and obvious numeric/hex tricks): block private ranges.
  if (/^[\d.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
    return !PRIVATE_V4.some((re) => re.test(host)) && /^\d+\.\d+\.\d+\.\d+$/.test(host);
  }
  // A real hostname needs at least one dot (no bare intranet names).
  return host.includes(".");
}
