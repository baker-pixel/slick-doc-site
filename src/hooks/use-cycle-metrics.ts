import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  cycle: { id: string; cycle_no: number; status: string; start: string; end: string };
  current: CycleWindowMetrics;
  previous: { cycle_no: number; metrics: CycleWindowMetrics } | null;
}

/** A cycle's numbers next to the previous cycle's, from the cycle_metrics SQL function. */
export function useCycleMetrics(clientAccountId: string) {
  return useQuery({
    queryKey: ["cycle-metrics", clientAccountId],
    staleTime: 60_000,
    queryFn: async () => {
      // The RPC isn't in the generated types yet.
      const { data, error } = await (supabase.rpc as unknown as (fn: string, args: object) => Promise<{ data: CycleMetrics | null; error: Error | null }>)(
        "cycle_metrics",
        { p_client_account_id: clientAccountId },
      );
      if (error) throw error;
      return data;
    },
  });
}
