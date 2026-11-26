import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Snapshot {
  id: string;
  period_start: string;
  period_end: string;
  metrics: { website_visits?: number; leads_generated?: number; email_opens?: number };
  highlights: { items?: string[] } | null;
}

/** Weekly client_analytics snapshots (the archive behind the Reports tab). */
export function useSnapshots(clientAccountId: string) {
  return useQuery({
    queryKey: ["analytics-snapshots", clientAccountId],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Snapshot[]> => {
      const { data, error } = await supabase
        .from("client_analytics")
        .select("id, period_start, period_end, metrics, highlights")
        .eq("client_account_id", clientAccountId)
        .order("period_end", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as unknown as Snapshot[];
    },
  });
}
