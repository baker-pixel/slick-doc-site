import { Eye, Heart, Share2 } from "lucide-react";
import type { SocialSummary } from "@/hooks/use-analytics-overview";
import { fmtNum, pctChange } from "@/lib/analyticsInsights";
import { StatCard } from "../PortalUI";
import { PostPerformanceCard } from "../social/PostPerformanceCard";

export function SocialTab({ clientAccountId, summary, days }: { clientAccountId: string; summary?: SocialSummary; days: number }) {
  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label={`Posts published · ${days}d`} value={fmtNum(summary.posts)} icon={Share2} />
          <StatCard label="Engagement" value={summary.reported ? fmtNum(summary.current.engagement) : "—"} icon={Heart} trend={summary.reported ? pctChange(summary.current.engagement, summary.previous.engagement) : undefined} trendLabel="vs previous period" />
          <StatCard label="Views" value={summary.reported ? fmtNum(summary.current.views) : "—"} icon={Eye} trend={summary.reported ? pctChange(summary.current.views, summary.previous.views) : undefined} trendLabel="vs previous period" />
        </div>
      )}
      <p className="text-xs text-muted-foreground -mt-2">Numbers are for posts published in this period. A dash means the platform doesn't report that number, not zero.</p>
      <PostPerformanceCard clientAccountId={clientAccountId} />
    </div>
  );
}
