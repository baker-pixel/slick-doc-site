import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CycleDigest {
  social?: {
    reviewed: number;
    approved: number;
    rejected: number;
    published: number;
    approval_rate: number | null;
  };
  prospect?: { discovered: number; replied: number; converted: number };
  learned?: string[];
}

export interface CycleSummary {
  id: string;
  cycle_no: number;
  period_start: string;
  period_end: string;
  status: string;
  digest: CycleDigest | null;
  plan: { learned?: string[]; discovery?: { focus?: string | null; discovered?: number } } | null;
}

/**
 * The client's current work cycle plus the most recent closed one. The closed
 * cycle's digest is what the current cycle was planned from.
 */
export function useCycles(clientAccountId: string | undefined) {
  return useQuery({
    queryKey: ["client-cycles", clientAccountId],
    enabled: !!clientAccountId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_cycles")
        .select("id, cycle_no, period_start, period_end, status, digest, plan")
        .eq("client_account_id", clientAccountId!)
        .order("period_end", { ascending: false })
        .limit(2);
      if (error) throw error;
      const rows = (data ?? []) as unknown as CycleSummary[];
      const current = rows.find((r) => r.status === "active" || r.status === "planning") ?? null;
      const previous = rows.find((r) => r.status === "closed") ?? null;
      return { current, previous };
    },
  });
}
