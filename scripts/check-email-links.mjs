#!/usr/bin/env node
// Static link check for everything the edge functions put in emails.
//
// Why: a "View Your Report" button once shipped pointing at /dashboard/undefined
// and a prospect hit "Dashboard not found". Nothing in CI could have caught it.
// This script fails (exit 1) when an emailed link
//   1. points at a path no route in the app serves (would 404 / hit catch-all),
//   2. interpolates a token straight into a URL with no guard for a missing
//      value (renders "/dashboard/undefined"), or
//   3. contains a known-bad literal (undefined, sample-token, legacy typos).
//
// Run: node scripts/check-email-links.mjs        (no dependencies, no network)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const FUNCTIONS_DIR = join(ROOT, "supabase/functions");

// Files whose links are admin previews with deliberate sample data.
const ALLOWLIST = {
  "send-test-email/index.ts": "admin preview email; uses a sample token on purpose",
  "generate-email-template/index.ts": "example values inside an AI prompt, never sent to a recipient",
};

// Paths that are not pages a recipient opens: Vercel API routes the functions
// call server-side, and a crawler user-agent URL.
const NON_PAGE_PATHS = [/^\/api\//, /^\/bot$/];

// A token interpolation is fine when the author marks it (use sparingly, say why)
// or when it sits inside a ternary/&& that already tests that same value.
const GUARD_MARKER = "link-check-ok";

// ---- routes the apps actually serve -------------------------------------
function routesFrom(file) {
  const src = readFileSync(join(ROOT, file), "utf8");
  return [...src.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== "*");
}
const MARKETING_ROUTES = routesFrom("src/apps/MarketingApp.tsx");
const CLIENT_ROUTES = routesFrom("src/apps/ClientApp.tsx");

const routeToRegex = (route) =>
  new RegExp("^" + route.replace(/\/:[^/]+/g, "/[^/]+").replace(/\/$/, "") + "/?$");
const matchesAny = (path, routes) => routes.some((r) => routeToRegex(r).test(path === "" ? "/" : path));

// ---- collect source files ------------------------------------------------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const errors = [];
const warnings = [];
let linksChecked = 0;

for (const file of walk(FUNCTIONS_DIR)) {
  const rel = relative(FUNCTIONS_DIR, file);
  const src = readFileSync(file, "utf8");
  const allow = ALLOWLIST[rel];

  // Which host does `${APP_URL}` / `${PORTAL_URL}` mean in this file?
  const hostVars = {};
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*Deno\.env\.get\([^)]*\)\s*\|\|\s*["']([^"']+)["']/g)) {
    hostVars[m[1]] = m[2];
  }

  const lineOf = (index) => src.slice(0, index).split("\n").length;
  const report = (list, index, msg) => {
    const entry = `${rel}:${lineOf(index)}  ${msg}`;
    if (allow) warnings.push(`${entry}  [allowlisted: ${allow}]`);
    else list.push(entry);
  };

  // URLs: literal host, or ${VAR} whose default host we know.
  const urlRe = /(https?:\/\/orangedoormarketing\.com|https?:\/\/client\.orangedoormarketing\.com|\$\{(APP_URL|PORTAL_URL)\})([^"'`\s<>)]*)/g;
  for (const m of src.matchAll(urlRe)) {
    let host = m[1];
    if (m[2]) host = hostVars[m[2]] ?? "";
    if (!host) continue; // host not statically known; skip
    const isClient = /client\./.test(host);
    // Only static parts of the path: cut at first ${ ... } boundary for matching.
    const rest = m[3];
    const rawPath = rest.split("?")[0].split("#")[0];
    const staticPath = rawPath.replace(/\$\{[^}]*\}/g, ":x");
    if (NON_PAGE_PATHS.some((re) => re.test(staticPath))) continue;
    linksChecked++;

    if (!matchesAny(staticPath.replace(/\/$/, ""), isClient ? CLIENT_ROUTES : MARKETING_ROUTES)) {
      report(errors, m.index, `link goes to "${staticPath || "/"}" but no ${isClient ? "client" : "marketing"} route serves it`);
    }

    // Raw token interpolation with no missing-value guard.
    const rawToken = /\$\{[^}]*(resumeToken|report_token|reportToken|token)[^}]*\}/i.exec(rest);
    const guarded = /\$\{\s*(reportUrl|resumeUrl)\(/.test(rest);
    if (rawToken && !guarded && /\/(dashboard|quick-report|report)\/\$\{|[?&]token=\$\{/.test(rest)) {
      // A guard elsewhere in the file (validToken) doesn't protect an inline interpolation.
      const before = src.slice(Math.max(0, m.index - 200), m.index);
      const tokenName = /\$\{\s*([\w.]+)/.exec(rawToken[0])?.[1] ?? "";
      const guardedByValidToken = /validToken\(/.test(before);
      const guardedByTernary = tokenName && new RegExp(`${tokenName.replace(/\./g, "\\.")}\\s*(\\?|&&)`).test(before);
      const marked = src.slice(Math.max(0, m.index - 300), m.index + 200).includes(GUARD_MARKER);
      if (!guardedByValidToken && !guardedByTernary && !marked) {
        report(errors, m.index, `token interpolated straight into the URL ("${rest.slice(0, 60)}"): renders "undefined" if missing. Wrap it in a guard like validToken().`);
      }
    }
  }

  // Known-bad literals anywhere inside a URL-ish string.
  for (const m of src.matchAll(/(\/dashboard\/(undefined|null)|token=(undefined|null)|orangestoremarketing|\/report\?token=)/g)) {
    report(errors, m.index, `known-bad link text "${m[0]}"`);
  }
  for (const m of src.matchAll(/sample-token/g)) {
    report(errors, m.index, `"sample-token" placeholder would 404 if it reached a real recipient`);
  }
}

console.log(`Checked ${linksChecked} emailed links against ${MARKETING_ROUTES.length} marketing + ${CLIENT_ROUTES.length} client routes.`);
for (const w of warnings) console.log(`  warn  ${w}`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error(`  FAIL  ${e}`);
  process.exit(1);
}
console.log("OK: every emailed link resolves to a real route and is guarded against missing tokens.");
