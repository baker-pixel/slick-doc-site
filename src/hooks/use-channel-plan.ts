import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { nextSchedulerRun, tierPolicy } from "@/lib/channelPlan";

export interface SavedChannelRow {
  platform: string;
  active: boolean;
  weight: number;
}

/** Which window the plan will be previewed (and, once saved, scheduled) against. */
export interface PlanTarget {
  kind: "current" | "next" | "rolling";
  start: Date;
  end: Date;
}

export interface ChannelPlanData {
  tier: string;
  /** Posts per month included in the client's plan. */
  postsPerMonth: number;
  connected: string[];
  saved: SavedChannelRow[];
  target: PlanTarget;
  /** Posts already in the target window (any channel), as `{platform, day}`. */
  existing: { platform: string; day: string }[];
  cycle: { id: string; cycle_no: number; period_start: string; period_end: string } | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Everything the Posting Plan card needs. The target window follows the same rule the
 * scheduler uses: a cycle that has already been scheduled from a plan keeps its split, so
 * edits start with the NEXT cycle; a cycle that has not (the client's first plan) is
 * scheduled with the new plan straight away.
 */
export function useChannelPlan(clientAccountId: string | undefined) {
  return useQuery({
    queryKey: ["channel-plan", clientAccountId],
    enabled: !!clientAccountId,
    staleTime: 30_000,
    queryFn: async (): Promise<ChannelPlanData> => {
      // client_channel_plan / channel_plan are newer than the generated types.
      const sb = supabase as any;
      const [clientRes, accountsRes, planRes, cycleRes] = await Promise.all([
        sb.from("client_accounts").select("tier").eq("id", clientAccountId).maybeSingle(),
        sb.from("client_postforme_accounts").select("platform").eq("client_id", clientAccountId).eq("status", "connected"),
        sb.from("client_channel_plan").select("platform, active, weight").eq("client_account_id", clientAccountId),
        sb.from("client_cycles")
          .select("id, cycle_no, period_start, period_end, channel_plan")
          .eq("client_account_id", clientAccountId)
          .in("status", ["planning", "active"])
          .gt("period_end", new Date().toISOString())
          .order("period_end", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const tier = (clientRes.data?.tier ?? "foundation") as string;
      const connected = Array.from(new Set<string>((accountsRes.data ?? []).map((a: any) => a.platform)));
      // The table may not exist yet on an environment that has not run the migration.
      const saved: SavedChannelRow[] = planRes.error ? [] : (planRes.data ?? []);
      const cycle = cycleRes.error ? null : cycleRes.data;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      let target: PlanTarget;
      if (cycle && cycle.channel_plan) {
        const start = new Date(cycle.period_end);
        target = { kind: "next", start, end: new Date(start.getTime() + 30 * DAY_MS) };
      } else if (cycle && nextSchedulerRun().getTime() >= new Date(cycle.period_end).getTime()) {
        // A first plan only becomes slots when the scheduler next runs (weekly, or when a cycle
        // starts). If that is after this cycle ends, nothing more is added to this cycle and the
        // plan really starts with the next one, so preview that instead of slots that won't exist.
        const start = new Date(cycle.period_end);
        target = { kind: "next", start, end: new Date(start.getTime() + 30 * DAY_MS) };
      } else if (cycle) {
        target = { kind: "current", start: new Date(cycle.period_start), end: new Date(cycle.period_end) };
      } else {
        target = { kind: "rolling", start: todayStart, end: new Date(todayStart.getTime() + 28 * DAY_MS) };
      }

      let existing: { platform: string; day: string }[] = [];
      if (target.kind !== "next") {
        const { data } = await sb
          .from("content_calendar")
          .select("platform, scheduled_for")
          .eq("client_account_id", clientAccountId)
          .gte("scheduled_for", target.start.toISOString())
          .lt("scheduled_for", target.end.toISOString());
        existing = (data ?? []).map((r: any) => ({
          platform: r.platform,
          day: new Date(r.scheduled_for).toISOString().slice(0, 10),
        }));
      }

      return {
        tier,
        postsPerMonth: tierPolicy(tier).social.postsPerMonth,
        connected,
        saved,
        target,
        existing,
        cycle: cycle
          ? { id: cycle.id, cycle_no: cycle.cycle_no, period_start: cycle.period_start, period_end: cycle.period_end }
          : null,
      };
    },
  });
}
