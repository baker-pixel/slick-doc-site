import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// post_metrics and site_traffic_daily aren't in the generated Supabase types yet.
const loose = supabase as any;

export interface OutreachOverview {
  days: number;
  current: { leads: number; opens: number; clicks: number };
  previous: { leads: number; opens: number; clicks: number };
  daily: { day: string; leads: number; opens: number; clicks: number }[];
}

/** Leads / human email opens / clicks for the window, from the client_analytics_overview SQL function. */
export function useOutreachOverview(clientAccountId: string, days: number) {
  return useQuery({
    queryKey: ["analytics-outreach", clientAccountId, days],
    staleTime: 60_000,
    queryFn: async () => {
      // The RPC isn't in the generated types yet.
      const { data, error } = await (supabase.rpc as unknown as (fn: string, args: object) => Promise<{ data: OutreachOverview | null; error: Error | null }>)(
        "client_analytics_overview",
        { p_client_account_id: clientAccountId, p_days: days },
      );
      if (error) throw error;
      return data as OutreachOverview;
    },
  });
}

export interface SocialSummary {
  posts: number;
  current: { engagement: number; views: number };
  previous: { engagement: number; views: number };
  /** False when no platform reported any engagement/view numbers at all (so we show "—", not 0). */
  reported: boolean;
}

/** Engagement and views of posts published in the window vs the window before (post_metrics running totals). */
export function useSocialSummary(clientAccountId: string, days: number) {
  return useQuery({
    queryKey: ["analytics-social", clientAccountId, days],
    staleTime: 60_000,
    queryFn: async (): Promise<SocialSummary> => {
      const now = Date.now();
      const since = new Date(now - days * 2 * 86_400_000).toISOString();
      const { data, error } = await loose
        .from("post_metrics")
        .select("posted_at, engagements, views")
        .eq("client_account_id", clientAccountId)
        .gte("posted_at", since);
      if (error) throw error;
      const cut = now - days * 86_400_000;
      const out: SocialSummary = { posts: 0, current: { engagement: 0, views: 0 }, previous: { engagement: 0, views: 0 }, reported: false };
      for (const r of (data ?? []) as { posted_at: string | null; engagements: number | null; views: number | null }[]) {
        if (!r.posted_at) continue;
        const bucket = new Date(r.posted_at).getTime() >= cut ? out.current : out.previous;
        if (bucket === out.current) out.posts += 1;
        bucket.engagement += r.engagements ?? 0;
        bucket.views += r.views ?? 0;
        if (r.engagements != null || r.views != null) out.reported = true;
      }
      return out;
    },
  });
}

export interface PluginTraffic {
  daily: { day: string; visits: number }[];
  current: number;
  previous: number;
}

/** Fallback website traffic from our WordPress plugin (site_traffic_daily), used until Google is connected. */
export function usePluginTraffic(clientAccountId: string, days: number, enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["analytics-plugin-traffic", clientAccountId, days],
    staleTime: 60_000,
    queryFn: async (): Promise<PluginTraffic | null> => {
      const { data: site, error: siteErr } = await supabase.from("connected_sites").select("id").eq("client_id", clientAccountId).maybeSingle();
      if (siteErr) throw siteErr;
      if (!site) return null;
      const iso = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await loose
        .from("site_traffic_daily")
        .select("day, visits")
        .eq("site_id", site.id)
        .gte("day", iso(days * 2 - 1))
        .order("day");
      if (error) throw error;
      const start = iso(days - 1);
      const rows = (data ?? []) as { day: string; visits: number }[];
      const map = new Map(rows.map((r) => [r.day, r.visits]));
      const daily = Array.from({ length: days }, (_, i) => {
        const day = iso(days - 1 - i);
        return { day, visits: map.get(day) ?? 0 };
      });
      return {
        daily,
        current: rows.filter((r) => r.day >= start).reduce((a, r) => a + r.visits, 0),
        previous: rows.filter((r) => r.day < start).reduce((a, r) => a + r.visits, 0),
      };
    },
  });
}
