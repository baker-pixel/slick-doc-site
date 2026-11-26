// Pure helpers for the portal Analytics tab (no imports, so they are trivially testable).

export const fmtNum = (n: number | null | undefined): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
};

/** Percent change vs the previous window; undefined when there is nothing to compare against. */
export function pctChange(current: number | null | undefined, previous: number | null | undefined): number | undefined {
  if (current == null || previous == null || previous <= 0) return undefined;
  return Math.round(((current - previous) / previous) * 100);
}

export interface InsightInput {
  days: number;
  visitors?: { current: number; previous: number; source: string } | null;
  leads: { current: number; previous: number };
  opens: { current: number; previous: number };
  social?: { current: number; previous: number } | null;
  topPage?: { path: string; views: number } | null;
  topChannel?: { channel: string; share: number } | null; // share 0..1
}

/** Up to three plain-English takeaways: the biggest movement first, then context. */
export function buildInsights(i: InsightInput): string[] {
  const out: string[] = [];
  const window = `the previous ${i.days} days`;

  const metrics = [
    { name: "Website visitors", ...(i.visitors ?? { current: 0, previous: 0 }), on: !!i.visitors },
    { name: "New leads", ...i.leads, on: true },
    { name: "Email opens", ...i.opens, on: true },
    { name: "Social engagement", ...(i.social ?? { current: 0, previous: 0 }), on: !!i.social },
  ]
    .filter((m) => m.on && m.previous >= 5) // tiny baselines make percentages meaningless
    .map((m) => ({ ...m, change: pctChange(m.current, m.previous) as number }))
    .filter((m) => Math.abs(m.change) >= 20)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  if (metrics[0]) {
    const m = metrics[0];
    out.push(`${m.name} ${m.change > 0 ? "rose" : "fell"} ${Math.abs(m.change)}% vs ${window} (${fmtNum(m.current)} vs ${fmtNum(m.previous)}).`);
  }
  if (i.leads.current > 0 && !metrics.some((m) => m.name === "New leads")) {
    out.push(`${fmtNum(i.leads.current)} new lead${i.leads.current === 1 ? "" : "s"} found in the last ${i.days} days.`);
  }
  if (i.topPage && i.topPage.views > 0) {
    out.push(`Your most-viewed page was ${i.topPage.path} (${fmtNum(i.topPage.views)} views).`);
  }
  if (i.topChannel && i.topChannel.share >= 0.3) {
    out.push(`${Math.round(i.topChannel.share * 100)}% of visits came from ${i.topChannel.channel}.`);
  }
  return out.slice(0, 3);
}
