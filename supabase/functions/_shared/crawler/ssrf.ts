// The crawler fetches URLs that clients type in, from our servers. That makes it a
// server-side-request-forgery risk unless every request (and every redirect hop) is
// checked. Pure checks on the URL itself; resolving DNS is done by the caller.

const PRIVATE_V4: [number, number][] = [
  [0x0a000000, 0x0affffff],   // 10.0.0.0/8
  [0x7f000000, 0x7fffffff],   // 127.0.0.0/8
  [0xa9fe0000, 0xa9feffff],   // 169.254.0.0/16 (cloud metadata)
  [0xac100000, 0xac1fffff],   // 172.16.0.0/12
  [0xc0a80000, 0xc0a8ffff],   // 192.168.0.0/16
  [0x64400000, 0x647fffff],   // 100.64.0.0/10 (carrier NAT)
  [0x00000000, 0x00ffffff],   // 0.0.0.0/8
  [0xc0000000, 0xc00000ff],   // 192.0.0.0/24
  [0xc6120000, 0xc613ffff],   // 198.18.0.0/15
  [0xe0000000, 0xffffffff],   // multicast + reserved
];

export function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function isPrivateIp(ip: string): boolean {
  const v4 = ipv4ToInt(ip);
  if (v4 !== null) return PRIVATE_V4.some(([lo, hi]) => v4 >= lo && v4 <= hi);
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (!v6.includes(":")) return false;
  if (v6 === "::1" || v6 === "::") return true;
  if (/^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)) return true; // fc00::/7, fe80::/10
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  // URL parsers normalise ::ffff:10.0.0.1 to its hex form ::ffff:a00:1
  const hex = v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16);
    return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return false;
}

export type UrlVerdict = { ok: true } | { ok: false; reason: string };

/** Is this URL safe for our servers to request? Literal hosts only; see isSafeResolved for DNS answers. */
export function checkUrlSafe(raw: string): UrlVerdict {
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, reason: "not a valid URL" }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, reason: "only http and https are allowed" };
  if (u.username || u.password) return { ok: false, reason: "URLs with credentials are not allowed" };
  if (u.port && u.port !== "80" && u.port !== "443") return { ok: false, reason: "only ports 80 and 443 are allowed" };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "missing host" };
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home.arpa")) {
    return { ok: false, reason: "internal host names are not allowed" };
  }
  if (!host.includes(".") && !host.includes(":")) return { ok: false, reason: "single-label host names are not allowed" };
  // Decimal / hex / octal integer hosts ("2130706433", "0x7f000001") normalise to IPs in browsers.
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) return { ok: false, reason: "numeric host is not allowed" };
  if (isPrivateIp(host)) return { ok: false, reason: "private or reserved IP addresses are not allowed" };
  return { ok: true };
}

/** After DNS: every address the host resolved to must be public. */
export function checkResolvedSafe(addresses: string[]): UrlVerdict {
  if (!addresses.length) return { ok: false, reason: "host did not resolve" };
  const bad = addresses.find(isPrivateIp);
  return bad ? { ok: false, reason: `host resolves to a private address (${bad})` } : { ok: true };
}
