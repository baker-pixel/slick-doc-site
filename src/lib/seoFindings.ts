// Groups the audit's per-page findings by check, so a full-site audit (hundreds of findings)
// reads as "Images missing alt text · 58 pages" instead of 58 near-identical rows. Pure.

export type FindingSeverity = "critical" | "warning" | "good";

export interface GroupableFinding {
  id: string;
  check_id: string;
  title: string;
  severity: FindingSeverity;
  pages: string[];
  impact: number;
  effort: number;
  plain_english: string;
  wp_applyable: boolean;
  fix?: { payload?: { value?: string } } | null;
}

export interface FindingGroup<T extends GroupableFinding> {
  check_id: string;
  title: string;
  severity: FindingSeverity;
  items: T[];
  /** every distinct page affected, across the group */
  pages: string[];
  impact: number;
  effort: number;
  /** the shared explanation, when every finding in the group says the same thing */
  explanation: string | null;
  /** how many findings in the group have a ready-to-apply fix */
  fixable: number;
}

const SEVERITY_RANK: Record<FindingSeverity, number> = { critical: 2, warning: 1, good: 0 };

/** Keeps the incoming order (the action plan's): a group sits where its highest-priority finding was. */
export function groupFindings<T extends GroupableFinding>(ordered: T[]): FindingGroup<T>[] {
  const groups = new Map<string, FindingGroup<T>>();
  for (const f of ordered) {
    let g = groups.get(f.check_id);
    if (!g) {
      g = { check_id: f.check_id, title: f.title, severity: f.severity, items: [], pages: [], impact: f.impact, effort: f.effort, explanation: f.plain_english, fixable: 0 };
      groups.set(f.check_id, g);
    }
    g.items.push(f);
    for (const p of f.pages) if (!g.pages.includes(p)) g.pages.push(p);
    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[g.severity]) g.severity = f.severity;
    if (f.plain_english !== g.explanation) g.explanation = null;
    if (f.wp_applyable && f.fix?.payload?.value) g.fixable++;
  }
  return [...groups.values()];
}

/** "58 pages", "1 page" */
export const pagesLabel = (n: number) => `${n} page${n === 1 ? "" : "s"}`;
