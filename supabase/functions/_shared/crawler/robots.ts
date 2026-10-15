// robots.txt parsing for the crawler. Pure. Follows the standard rules: the most
// specific user-agent group wins, the longest matching path rule wins (Allow
// beats Disallow on a tie), `*` matches any run of characters and `$` anchors
// the end of the URL.

export interface RobotsRules {
  /** Allow/Disallow rules that apply to our crawler (its own group, else `*`). */
  rules: { allow: boolean; pattern: string }[];
  crawlDelaySeconds: number | null;
  sitemaps: string[];
  /** True when the file exists but could not be understood as robots rules (e.g. an HTML error page). */
  unparseable: boolean;
}

export const BOT_NAME = "orangedoorseobot";

export function parseRobots(text: string, botName = BOT_NAME): RobotsRules {
  const sitemaps: string[] = [];
  const groups: { agents: string[]; rules: { allow: boolean; pattern: string }[]; delay: number | null }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  let sawDirective = false;

  const body = text.replace(/^﻿/, "");
  if (/^\s*<(!doctype|html|head|body)/i.test(body)) return { rules: [], crawlDelaySeconds: null, sitemaps, unparseable: true };

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const field = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (field === "sitemap") { if (value) sitemaps.push(value); sawDirective = true; continue; }
    if (field === "user-agent") {
      if (!lastWasAgent || !cur) { cur = { agents: [], rules: [], delay: null }; groups.push(cur); }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true; sawDirective = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (field === "allow" || field === "disallow") { cur.rules.push({ allow: field === "allow", pattern: value }); sawDirective = true; }
    else if (field === "crawl-delay") { const n = parseFloat(value); if (Number.isFinite(n) && n >= 0) cur.delay = n; sawDirective = true; }
  }

  // Our own group beats `*`.
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && a.length > 0 && botName.includes(a.replace(/\/.*$/, ""))));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules).filter((r) => r.pattern !== ""); // "Disallow:" with no value allows everything
  const delays = chosen.map((g) => g.delay).filter((d): d is number => d !== null);
  return { rules, crawlDelaySeconds: delays.length ? Math.max(...delays) : null, sitemaps, unparseable: !sawDirective && body.trim().length > 0 };
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const core = (anchored ? pattern.slice(0, -1) : pattern).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + core + (anchored ? "$" : ""));
}

/** May we fetch this path (+ query)? No robots rules means yes. */
export function robotsAllows(robots: RobotsRules | null, pathAndQuery: string): boolean {
  if (!robots || robots.unparseable) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const r of robots.rules) {
    if (!patternToRegex(r.pattern).test(pathAndQuery)) continue;
    const len = r.pattern.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
  }
  return best ? best.allow : true;
}

/** True when the whole site is off limits to us (Disallow: / with nothing more specific allowing anything). */
export function robotsBlocksEverything(robots: RobotsRules | null): boolean {
  return !!robots && !robots.unparseable && !robotsAllows(robots, "/") && !robots.rules.some((r) => r.allow && r.pattern !== "/");
}
