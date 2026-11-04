// Optional JavaScript renderer (Browserless). Used only for pages that look empty without
// JavaScript, and only when BROWSERLESS_API_KEY is set; otherwise the crawler keeps the
// plain page and the audit says so honestly.
import { checkUrlSafe } from "./ssrf.ts";

export function makeRenderer(): ((url: string) => Promise<string | null>) | undefined {
  const key = Deno.env.get("BROWSERLESS_API_KEY");
  if (!key) return undefined;
  return async (url: string) => {
    if (!checkUrlSafe(url).ok) return null;
    try {
      const res = await fetch(`https://chrome.browserless.io/content?token=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, waitFor: 2000 }),
        signal: AbortSignal.timeout(25_000),
      });
      return res.ok ? await res.text() : null;
    } catch {
      return null;
    }
  };
}
