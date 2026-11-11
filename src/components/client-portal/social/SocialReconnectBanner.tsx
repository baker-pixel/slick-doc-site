import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
};

const label = (platform: string) => LABELS[platform] ?? platform.charAt(0).toUpperCase() + platform.slice(1);

/** "Facebook", "Facebook and LinkedIn", "Facebook, LinkedIn and Instagram". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

interface SocialReconnectBannerProps {
  clientAccountId: string;
  /** Takes the client to the Connected Accounts tab, where each card has its own Reconnect button. */
  onReconnect: () => void;
  /** Changes whenever the client moves between sub-tabs, so the banner re-checks after a reconnect. */
  refreshToken?: string;
}

/**
 * Shown across the Social & Accounts tab when a connection has been flagged `needs_reauth` (the
 * platform rejected our posts because the token expired or permissions are missing). Without it
 * the only sign is a badge on the Connected Accounts tab, which a client on the Composer or the
 * Posting Plan never sees while their posts keep failing.
 */
export function SocialReconnectBanner({ clientAccountId, onReconnect, refreshToken }: SocialReconnectBannerProps) {
  const { data, refetch } = useQuery({
    queryKey: ["social-reconnect", clientAccountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_postforme_accounts")
        .select("platform")
        .eq("client_id", clientAccountId)
        .eq("status", "needs_reauth");
      if (error) throw error;
      return [...new Set((data ?? []).map((r) => r.platform as string))];
    },
    // Coming back from the reconnect popup should clear the banner without a reload.
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    void refetch();
  }, [refreshToken, refetch]);

  if (!data || data.length === 0) return null;

  const names = data.map(label);
  const many = names.length > 1;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900" role="alert">
      <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-[200px] flex-1 text-sm">
        <p className="font-medium">
          {joinNames(names)} {many ? "need" : "needs"} to be reconnected
        </p>
        <p className="mt-0.5">
          {many ? "These connections have" : "This connection has"} expired or lost a permission, so posts to {many ? "them are" : "it is"} failing
          until {many ? "they're" : "it's"} reconnected. Tick every permission when asked.
        </p>
      </div>
      <Button size="sm" className="gap-1.5" onClick={onReconnect}>
        <RefreshCw className="h-3.5 w-3.5" />
        Reconnect {many ? "accounts" : names[0]}
      </Button>
    </div>
  );
}
