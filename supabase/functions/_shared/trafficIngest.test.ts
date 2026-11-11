import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  isBotUserAgent,
  localDay,
  originMatchesSite,
  parsePageview,
  referrerHost,
  visitorHash,
  WindowCounter,
} from "./trafficIngest.ts";

const KEY = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const body = (o: Record<string, unknown>) => JSON.stringify({ k: KEY, p: "/pricing", ...o });

Deno.test("parsePageview: accepts a minimal beacon", () => {
  const p = parsePageview(body({}));
  assertEquals(p?.key, KEY);
  assertEquals(p?.path, "/pricing");
  assertEquals(p?.device, null);
});

Deno.test("parsePageview: strips query string and hash from the path (can hold emails/tokens)", () => {
  assertEquals(parsePageview(body({ p: "/thanks?email=a@b.com&token=abc#frag" }))?.path, "/thanks");
  assertEquals(parsePageview(body({ p: "/?utm_source=x" }))?.path, "/");
});

Deno.test("parsePageview: rejects bad keys, bad paths, bad JSON, oversize bodies", () => {
  assertEquals(parsePageview(JSON.stringify({ k: "short", p: "/" })), null);
  assertEquals(parsePageview(JSON.stringify({ k: KEY.toUpperCase().replace(/[A-F]/g, "Z"), p: "/" })), null);
  assertEquals(parsePageview(body({ p: "https://evil.com/x" })), null); // not a path
  assertEquals(parsePageview(body({ p: "//evil.com/x" })), null); // protocol-relative
  assertEquals(parsePageview(body({ p: "" })), null);
  assertEquals(parsePageview("not json"), null);
  assertEquals(parsePageview("[]"), null);
  assertEquals(parsePageview(""), null);
  assertEquals(parsePageview(body({ p: "/" + "a".repeat(3000) })), null);
});

Deno.test("parsePageview: accepts an upper-case key by normalizing it", () => {
  assertEquals(parsePageview(JSON.stringify({ k: KEY.toUpperCase(), p: "/" }))?.key, KEY);
});

Deno.test("parsePageview: only mobile/tablet/desktop are valid devices; utm fields are trimmed and bounded", () => {
  assertEquals(parsePageview(body({ d: "mobile" }))?.device, "mobile");
  assertEquals(parsePageview(body({ d: "toaster" }))?.device, null);
  const p = parsePageview(body({ u: { s: "  news\u0000letter ", m: "email", c: "x".repeat(500) } }));
  assertEquals(p?.utmSource, "newsletter");
  assertEquals(p?.utmMedium, "email");
  assertEquals(p?.utmCampaign?.length, 100);
});

Deno.test("originMatchesSite: same host passes regardless of www/scheme", () => {
  assert(originMatchesSite("https://www.example.com", null, "https://example.com"));
  assert(originMatchesSite("http://example.com", null, "https://www.example.com"));
});

Deno.test("originMatchesSite: other host, missing headers, or 'null' origin are rejected", () => {
  assert(!originMatchesSite("https://evil.com", null, "https://example.com"));
  assert(!originMatchesSite("https://example.com.evil.com", null, "https://example.com"));
  assert(!originMatchesSite(null, null, "https://example.com"));
  assert(!originMatchesSite("null", null, "https://example.com"));
});

Deno.test("originMatchesSite: falls back to Referer only when Origin is absent", () => {
  assert(originMatchesSite(null, "https://example.com/page", "https://example.com"));
  assert(!originMatchesSite("https://evil.com", "https://example.com/page", "https://example.com"));
});

Deno.test("referrerHost: external hosts kept, own site and junk dropped", () => {
  assertEquals(referrerHost("https://www.google.com/search?q=x", "https://example.com"), "google.com");
  assertEquals(referrerHost("https://example.com/other", "https://example.com"), null);
  assertEquals(referrerHost("https://www.example.com/", "https://example.com"), null);
  assertEquals(referrerHost("", "https://example.com"), null);
  assertEquals(referrerHost(null, "https://example.com"), null);
  assertEquals(referrerHost("not a url", "https://example.com"), null);
});

Deno.test("isBotUserAgent: crawlers and missing UA are bots, real browsers are not", () => {
  assert(isBotUserAgent(null));
  assert(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"));
  assert(isBotUserAgent("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36"));
  assert(isBotUserAgent("Mozilla/5.0 (Linux; Android 11) Chrome-Lighthouse"));
  assert(!isBotUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"));
  assert(!isBotUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"));
});

Deno.test("visitorHash: stable within a day, different across days, sites, IPs and agents", async () => {
  const a = await visitorHash("salt", "site1", "2026-11-04", "1.2.3.4", "UA");
  assertEquals(a, await visitorHash("salt", "site1", "2026-11-04", "1.2.3.4", "UA"));
  assertEquals(a.length, 32);
  assertNotEquals(a, await visitorHash("salt", "site1", "2026-11-05", "1.2.3.4", "UA")); // next day
  assertNotEquals(a, await visitorHash("salt", "site2", "2026-11-04", "1.2.3.4", "UA")); // other site
  assertNotEquals(a, await visitorHash("salt", "site1", "2026-11-04", "1.2.3.5", "UA")); // other IP
  assertNotEquals(a, await visitorHash("salt", "site1", "2026-11-04", "1.2.3.4", "UB")); // other browser
  assertNotEquals(a, await visitorHash("other", "site1", "2026-11-04", "1.2.3.4", "UA")); // other salt
});

Deno.test("visitorHash: does not contain the IP", async () => {
  const h = await visitorHash("salt", "site1", "2026-11-04", "203.0.113.77", "UA");
  assert(!h.includes("203"));
});

Deno.test("localDay: uses the site's timezone, falls back to UTC for unknown zones", () => {
  const now = new Date("2026-11-04T03:00:00Z");
  assertEquals(localDay("America/Los_Angeles", now), "2026-11-03");
  assertEquals(localDay("Asia/Kolkata", now), "2026-11-04");
  assertEquals(localDay(null, now), "2026-11-04");
  assertEquals(localDay("Not/AZone", now), "2026-11-04");
});

Deno.test("WindowCounter: allows up to the limit, then blocks until the window resets", () => {
  const c = new WindowCounter(3, 1000);
  assert(c.hit("k", 0));
  assert(c.hit("k", 10));
  assert(c.hit("k", 20));
  assert(!c.hit("k", 30)); // 4th in the window
  assert(c.hit("other", 30)); // other keys unaffected
  assert(c.hit("k", 1000)); // new window
});

Deno.test("WindowCounter: memory stays bounded under many distinct keys", () => {
  const c = new WindowCounter(5, 60_000, 100);
  for (let i = 0; i < 1000; i++) c.hit(`k${i}`, 0);
  // Reaching here without growing unbounded is the point; the counter must still work.
  assert(c.hit("fresh", 1));
});

// Contract with the plugin's footer script (wp-plugin/orangedoor.php, v1.3.0): this is
// the exact shape that script posts. If either side changes, this test must change too.
Deno.test("parsePageview: accepts the exact payload the plugin script sends", () => {
  const fromPlugin = '{"k":"a1b2c3d4e5f60718293a4b5c6d7e8f90","p":"/pricing","r":"https://www.google.com/search?q=x","u":{"s":"news","m":"email","c":null},"d":"desktop"}';
  const p = parsePageview(fromPlugin);
  assertEquals(p?.path, "/pricing");
  assertEquals(p?.referrer, "https://www.google.com/search?q=x");
  assertEquals(p?.utmSource, "news");
  assertEquals(p?.utmMedium, "email");
  assertEquals(p?.utmCampaign, null);
  assertEquals(p?.device, "desktop");
  assertEquals(referrerHost(p!.referrer, "https://a.test"), "google.com");
});

Deno.test("parsePageview: accepts the plugin's later-view payload (blank referrer, no utm)", () => {
  const p = parsePageview('{"k":"a1b2c3d4e5f60718293a4b5c6d7e8f90","p":"/about","r":"","u":{"s":null,"m":null,"c":null},"d":"mobile"}');
  assertEquals(p?.path, "/about");
  assertEquals(p?.referrer, null);
  assertEquals(p?.device, "mobile");
});
