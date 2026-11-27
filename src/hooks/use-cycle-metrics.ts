import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Goal } from "@/lib/cycleView";

export interface CycleWindowMetrics {
  window: { start: string; end: string; days: number };
  social: {
    published: number;
    measured: number;
    by_platform: Record<string, { posts: number; measured: number; views_total: number; views_median: number | null; engagements_total: number }>;
    by_pillar: Record<string, { posts: number; measured: number; views_median: number | null }>;
  };
  outreach: { leads: number; outreach_started: number; opens: number; clicks: number; replies: number; reply_classes: Record<string, number> };
  website: { visits: number; pageviews: number; days_with_data: number; window_days: number; top_referrers: { host: string; views: number }[] };
  seo: { score_end: number | null; score_before: number | null };
}

export interface CycleMetrics {
  cycle: { id: string; cycle_no: number; status: string; start: string; end: string; period_end_nominal: string };
  current: CycleWindowMetrics;
  previous: { cycle_no: number; metrics: CycleWindowMetrics } | null;
  goals: Goal[];
}

// The RPCs and post_metrics aren't in the generated types yet.
const loose = supabase as any;

/** One cycle's numbers next to the previous cycle's (cycle_metrics SQL function). */
export function useCycleMetrics(clientAccountId: string, cycleId: string | undefined) {
  return useQuery({
    queryKey: ["cycle-metrics", clientAccountId, cycleId],
    enabled: !!cycleId,
    staleTime: 60_000,
    queryFn: async (): Promise<CycleMetrics | null> => {
      const { data, error } = await loose.rpc("cycle_metrics", { p_client_account_id: clientAccountId, p_cycle_id: cycleId });
      if (error) throw error;
      return data as CycleMetrics | null;
    },
  });
}

export interface CycleReview {
  mode: "off" | "shadow" | "live";
  reviewed_cycle_no: number;
  findings: string[];
  bets: { id: string; hypothesis: string; change: string; scope: "social" | "prospect"; metric: string; evidence: string }[];
}

export interface CycleListItem {
  id: string;
  cycle_no: number;
  status: string;
  period_start: string;
  period_end: string;
  closed_at: string | null;
  plan: { review?: CycleReview } | null;
}

/** The client's cycles, newest first, for the switcher. */
export function useCycleList(clientAccountId: string) {
  return useQuery({
    queryKey: ["cycle-list", clientAccountId],
    staleTime: 60_000,
    queryFn: async (): Promise<CycleListItem[]> => {
      const { data, error } = await loose
        .from("client_cycles")
        .select("id, cycle_no, status, period_start, period_end, closed_at, plan")
        .eq("client_account_id", clientAccountId)
        .in("status", ["active", "closed"])
        .order("cycle_no", { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []) as CycleListItem[];
    },
  });
}

export interface CyclePost {
  id: string;
  title: string;
  platform: string | null;
  published_at: string;
  url: string | null;
  views: number | null;
}

/** Posts published inside a cycle window, newest first, with views where the platform reports them. */
export function useCyclePosts(clientAccountId: string, start: string | undefined, end: string | undefined) {
  return useQuery({
    queryKey: ["cycle-posts", clientAccountId, start, end],
    enabled: !!start && !!end,
    staleTime: 60_000,
    queryFn: async (): Promise<{ posts: CyclePost[]; total: number }> => {
      const { data, count, error } = await loose
        .from("content_calendar")
        .select("id, title, platform, published_at, metadata", { count: "exact" })
        .eq("client_account_id", clientAccountId)
        .eq("status", "published")
        .gte("published_at", start)
        .lt("published_at", end)
        .order("published_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      const rows = (data ?? []) as { id: string; title: string; platform: string | null; published_at: string; metadata: Record<string, unknown> | null }[];
      const views = new Map<string, number | null>();
      if (rows.length) {
        const { data: m, error: mErr } = await loose.from("post_metrics").select("calendar_id, views").in("calendar_id", rows.map((r) => r.id));
        if (mErr) throw mErr;
        for (const r of (m ?? []) as { calendar_id: string; views: number | null }[]) views.set(r.calendar_id, r.views);
      }
      return {
        total: count ?? rows.length,
        posts: rows.map((r) => ({
          id: r.id, title: r.title, platform: r.platform, published_at: r.published_at,
          url: typeof r.metadata?.platform_post_url === "string" ? r.metadata.platform_post_url : null,
          views: views.get(r.id) ?? null,
        })),
      };
    },
  });
}
