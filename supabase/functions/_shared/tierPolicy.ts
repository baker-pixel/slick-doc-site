// Phase B — the single source of truth for what each plan tier gets.
//
// Tier used to only shape the onboarding workflow; ongoing engine behavior
// (crawl depth, content volume, prospecting, report cadence) was hardcoded in
// each function. Every engine and cron now reads this module instead, so a
// client's plan actually governs the work they receive, and changing a tier
// changes everything downstream from one place.

export type Tier = "foundation" | "growth" | "transformation";

export interface TierPolicy {
  tier: Tier;
  seo: {
    /** pages crawled per audit */
    crawlPages: number;
    /** how often a re-audit should run (consumed by the re-audit cron, Phase E) */
    reauditCadenceDays: number;
    /** how far the WordPress apply path may go */
    applyMode: "off" | "key_pages" | "full";
  };
  social: {
    /** content types generated per batch (run-ai-batch) */
    contentTypes: string[];
    /** target published posts per month (content scheduling) */
    postsPerMonth: number;
  };
  prospect: {
    enabled: boolean;
    /** prospects discovered per run */
    discoveryBatch: number;
  };
  /** Paid-tier live LLM probe -- does ChatGPT/Claude actually cite this client
   * when asked a category+location question. Distinct from the free
   * ai_readiness_scores heuristic (schema/llms.txt/crawlability), which every
   * report gets regardless of tier. */
  aiVisibility: {
    enabled: boolean;
    /** prompts probed per client per monthly run, across both models */
    promptsPerMonth: number;
  };
  reporting: {
    weekly: boolean;
    monthly: boolean;
  };
}

const POLICIES: Record<Tier, TierPolicy> = {
  foundation: {
    tier: "foundation",
    seo: { crawlPages: 5, reauditCadenceDays: 90, applyMode: "off" },
    social: { contentTypes: ["google_post"], postsPerMonth: 4 },
    prospect: { enabled: false, discoveryBatch: 0 },
    aiVisibility: { enabled: false, promptsPerMonth: 0 },
    reporting: { weekly: false, monthly: true },
  },
  growth: {
    tier: "growth",
    seo: { crawlPages: 10, reauditCadenceDays: 30, applyMode: "key_pages" },
    social: { contentTypes: ["google_post", "social_post", "email_newsletter"], postsPerMonth: 12 },
    prospect: { enabled: true, discoveryBatch: 10 },
    aiVisibility: { enabled: true, promptsPerMonth: 8 },
    reporting: { weekly: true, monthly: true },
  },
  transformation: {
    tier: "transformation",
    seo: { crawlPages: 15, reauditCadenceDays: 30, applyMode: "full" },
    social: { contentTypes: ["google_post", "social_post", "email_newsletter", "blog_post"], postsPerMonth: 20 },
    prospect: { enabled: true, discoveryBatch: 20 },
    aiVisibility: { enabled: true, promptsPerMonth: 8 },
    reporting: { weekly: true, monthly: true },
  },
};

/** Normalize any stored tier string; unknown/empty falls back to foundation. */
export function tierPolicy(tier: string | null | undefined): TierPolicy {
  const key = (tier ?? "").toLowerCase().trim();
  return POLICIES[key as Tier] ?? POLICIES.foundation;
}
