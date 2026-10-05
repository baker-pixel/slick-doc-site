#!/usr/bin/env node
// Live smoke test for the Quick Analysis flow, against the deployed backend.
//
//   node scripts/smoke-quick-analysis.mjs
//   SITE_URL=https://orangedoormarketing.com REPORT_TOKEN=<uuid> node scripts/smoke-quick-analysis.mjs
//
// Sends NO email and creates NO leads: scans are anonymous (no name/email), so
// nothing is saved or mailed. It does use ~2 slots of the per-IP rate limit
// (10/hour). Reads VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY from .env.
//
// Optional:
//   SITE_URL       also checks the public site serves the report/dashboard routes
//   REPORT_TOKEN   a real prospects.report_token; verifies the online report loads
//                  and exposes only the safe fields
//   SCAN_URL       site to scan (default https://orangedoormarketing.com)

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  (() => {
    try {
      return readFileSync(new URL("../.env", import.meta.url), "utf8")
        .split("\n")
        .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2]]);
    } catch {
      return [];
    }
  })(),
);
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (set them or add a .env).");
  process.exit(2);
}
const SCAN_URL = process.env.SCAN_URL ?? "https://orangedoormarketing.com";

const fn = async (name, body, headers = {}) => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
};

let failed = 0;
const results = [];
async function check(name, run) {
  const t0 = Date.now();
  try {
    await run();
    results.push(`  PASS  ${name} (${Date.now() - t0}ms)`);
  } catch (e) {
    failed++;
    results.push(`  FAIL  ${name}: ${e.message}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

await check("blocks internal/metadata addresses (SSRF)", async () => {
  for (const url of ["http://169.254.169.254/latest/meta-data", "http://localhost:8080", "http://10.0.0.1"]) {
    const { status, json } = await fn("analyze-website", { url });
    assert(status === 400 && json?.reason === "invalid_url", `${url} -> ${status} ${JSON.stringify(json)}`);
  }
});

await check("honeypot rejects bots without spending a scan", async () => {
  const { status } = await fn("analyze-website", { url: SCAN_URL, hp: "i-am-a-bot" });
  assert(status === 429, `expected 429, got ${status}`);
});

await check("unreachable site gives a plain-language reason, not a generic error", async () => {
  const { status, json } = await fn("analyze-website", { url: "https://notaurl.invalid" });
  assert(status === 400 && json?.reason === "unreachable", `got ${status} ${JSON.stringify(json)}`);
  assert(typeof json.error === "string" && json.error.length > 20 && !/non-2xx/i.test(json.error), "message not user-friendly");
});

await check(`real scan of ${SCAN_URL} returns a complete analysis`, async () => {
  const { status, json } = await fn("analyze-website", { url: SCAN_URL });
  assert(status === 200, `status ${status} ${JSON.stringify(json)?.slice(0, 200)}`);
  const a = json?.analysis;
  assert(a, "no analysis in response");
  for (const k of ["seo", "conversion", "technical", "engagement", "metrics"]) {
    assert(typeof a[k]?.score === "number" && a[k].score >= 0 && a[k].score <= 100, `${k}.score missing/out of range`);
    assert(Array.isArray(a[k].findings) && Array.isArray(a[k].recommendations), `${k} missing findings/recommendations`);
  }
  assert(typeof a.summary === "string" && a.summary.length > 30, "summary missing");
  assert(json.prospectId === null, "anonymous scan must not create a lead");
});

await check("send-prospect-report refuses unauthenticated callers", async () => {
  for (const headers of [{ Authorization: "" }, { Authorization: "Bearer not-the-service-key" }, { Authorization: `Bearer ${ANON_KEY}` }]) {
    const { status } = await fn("send-prospect-report", { prospectId: "00000000-0000-0000-0000-000000000000" }, headers);
    assert(status === 401, `expected 401, got ${status}`);
  }
});

await check("online report: unknown / malformed tokens return a clean not-found", async () => {
  for (const token of ["00000000-0000-0000-0000-000000000000", "not-a-uuid", "", null]) {
    const { status, json } = await fn("get-prospect-report", { token });
    assert(status === 404 && json?.found === false, `${JSON.stringify(token)} -> ${status} ${JSON.stringify(json)}`);
  }
});

if (process.env.REPORT_TOKEN) {
  await check("online report: real token loads and exposes only safe fields", async () => {
    const { status, json } = await fn("get-prospect-report", { token: process.env.REPORT_TOKEN });
    assert(status === 200 && json?.found === true, `status ${status}`);
    const keys = Object.keys(json.report).sort().join(",");
    assert(keys === "aiReadinessScore,analysis,createdAt,name,websiteUrl", `unexpected fields: ${keys}`);
    assert(typeof json.report.analysis?.seo?.score === "number", "analysis incomplete");
  });
}

if (process.env.SITE_URL) {
  const site = process.env.SITE_URL.replace(/\/$/, "");
  // A single-page app answers 200 for ANY path, so the checks below can't prove a
  // route exists. Look for the route inside the deployed JavaScript instead.
  await check("deployed frontend actually contains the /quick-report route", async () => {
    // The apex domain redirects to www, and Vite code-splits the app: the routes
    // live in a lazy MarketingApp chunk, not in the script tags of the HTML.
    // So follow the HTML's scripts and then the chunk files they reference.
    const home = await fetch(site + "/", { signal: AbortSignal.timeout(20_000) });
    const base = new URL(home.url);
    const queue = [...(await home.text()).matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
    assert(queue.length > 0, "no script bundles found on the home page");
    const seen = new Set();
    let found = false;
    while (queue.length && !found && seen.size < 40) {
      const path = queue.shift();
      if (seen.has(path)) continue;
      seen.add(path);
      const res = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) continue;
      const js = await res.text();
      if (js.includes("quick-report/:token")) { found = true; break; }
      for (const m of js.matchAll(/["'`](?:\.\/|\/assets\/)([A-Za-z0-9_-]+-[A-Za-z0-9_-]{6,}\.js)["'`]/g)) queue.push("/assets/" + m[1]);
    }
    assert(found, `no /quick-report route in the live site bundles (checked ${seen.size} files) -- frontend not deployed yet?`);
  });

  for (const path of ["/quick-analysis", "/quick-report/00000000-0000-0000-0000-000000000000", "/dashboard/00000000-0000-0000-0000-000000000000", "/gap-analysis"]) {
    await check(`site serves ${path} (no 404)`, async () => {
      const res = await fetch(site + path, { signal: AbortSignal.timeout(20_000) });
      assert(res.status === 200, `status ${res.status}`);
      assert((res.headers.get("content-type") ?? "").includes("text/html"), "not an HTML page");
    });
  }
}

console.log(`Quick Analysis smoke test (${SUPABASE_URL})`);
for (const r of results) console.log(r);
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
