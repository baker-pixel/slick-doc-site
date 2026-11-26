import { useMemo, useState } from "react";
import { BarChart3, Download, Eye, Heart, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { useGoogleAnalytics } from "@/hooks/use-google-analytics";
import { useOutreachOverview, usePluginTraffic, useSocialSummary } from "@/hooks/use-analytics-overview";
import { useSnapshots } from "@/hooks/use-analytics-snapshots";
import { buildInsights, fmtNum, pctChange } from "@/lib/analyticsInsights";
import { generatePerformancePdf } from "@/lib/analyticsPdf";
import { PageHeader } from "./PortalUI";
import { KpiCard } from "./analytics/KpiCard";
import { InsightsStrip } from "./analytics/InsightsStrip";
import { OutreachTab } from "./analytics/OutreachTab";
import { RangeToggle, type Range } from "./analytics/RangeToggle";
import { ReportsTab } from "./analytics/ReportsTab";
import { SocialTab } from "./analytics/SocialTab";
import { WebsiteTab } from "./analytics/WebsiteTab";
import type { PortalTab } from "./ClientPortalSidebar";

interface ClientAnalyticsTabProps {
  clientAccountId: string;
  businessName?: string;
  /** Lets tabs send the client elsewhere in the portal (e.g. SEO to connect a site, Lead Outreach). */
  onOpenTab?: (tab: PortalTab) => void;
}

/**
 * One date range drives everything. Website traffic comes from Google Analytics when connected
 * (our WordPress plugin's counts are a temporary fallback); leads/opens/clicks come from a single SQL
 * function that matches Home and Lead Outreach (human opens only); social from post_metrics.
 */
export default function ClientAnalyticsTab({ clientAccountId, businessName, onOpenTab }: ClientAnalyticsTabProps) {
  const [days, setDays] = useState<Range>(28);

  const ga = useGoogleAnalytics(clientAccountId, days);
  const plugin = usePluginTraffic(clientAccountId, days, !ga.loading && !ga.active);
  const outreach = useOutreachOverview(clientAccountId, days);
  const social = useSocialSummary(clientAccountId, days);
  const snapshots = useSnapshots(clientAccountId);

  // Website visitors: Google first, plugin second, otherwise unavailable.
  const web = useMemo(() => {
    if (ga.active) {
      return { source: "Google Analytics", current: ga.active.current.users, previous: ga.active.previous.users, spark: ga.active.daily.map((d) => d.users) };
    }
    const p = plugin.data;
    if (p && (p.current > 0 || p.previous > 0)) {
      return { source: "Site plugin", current: p.current, previous: p.previous, spark: p.daily.map((d) => d.visits) };
    }
    return null;
  }, [ga.active, plugin.data]);

  const o = outreach.data;
  const s = social.data;

  const insights = useMemo(() => {
    if (!o) return [];
    const ch = ga.active?.channels ?? [];
    const chTotal = ch.reduce((a, c) => a + c.sessions, 0);
    return buildInsights({
      days,
      visitors: web ? { current: web.current, previous: web.previous, source: web.source } : null,
      leads: { current: o.current.leads, previous: o.previous.leads },
      opens: { current: o.current.opens, previous: o.previous.opens },
      social: s?.reported ? { current: s.current.engagement, previous: s.previous.engagement } : null,
      topPage: ga.active?.top_pages[0] ?? null,
      topChannel: ch[0] && chTotal > 0 ? { channel: ch[0].channel, share: ch[0].sessions / chTotal } : null,
    });
  }, [o, s, web, ga.active, days]);

  const downloadReport = () => {
    if (!o) return;
    try {
      generatePerformancePdf({
        businessName,
        days,
        sourceNote: web ? `Website data: ${web.source}` : undefined,
        insights,
        highlights: snapshots.data?.[0]?.highlights?.items?.filter(Boolean) ?? [],
        kpis: [
          { label: "Website visitors", value: web ? fmtNum(web.current) : "—", trend: web ? pctChange(web.current, web.previous) : undefined },
          { label: "New leads", value: fmtNum(o.current.leads), trend: pctChange(o.current.leads, o.previous.leads) },
          { label: "Email opens", value: fmtNum(o.current.opens), trend: pctChange(o.current.opens, o.previous.opens) },
          { label: "Social engagement", value: s?.reported ? fmtNum(s.current.engagement) : "—", trend: s?.reported ? pctChange(s.current.engagement, s.previous.engagement) : undefined },
        ],
      });
      toast({ title: "Report downloaded", description: "Your performance report has been saved." });
    } catch (e) {
      console.error("Error generating PDF:", e);
      toast({ title: "Couldn't generate report", description: "Please try again in a moment.", variant: "destructive" });
    }
  };

  const webLoading = ga.loading || (!ga.active && plugin.isLoading);
  const spark = (k: "leads" | "opens") => o?.daily.map((d) => d[k]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance Analytics"
        description={`How your marketing is doing over the last ${days} days`}
        icon={BarChart3}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <RangeToggle value={days} onChange={setDays} />
            <Button onClick={downloadReport} variant="outline" className="rounded-xl" disabled={!o}>
              <Download className="h-4 w-4 mr-2" />Download report
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Website visitors" icon={Eye} loading={webLoading}
          value={web ? fmtNum(web.current) : "—"}
          trend={web ? pctChange(web.current, web.previous) : undefined}
          spark={web?.spark}
          note={web ? `Source: ${web.source}` : "Connect Google Analytics to see this"}
        />
        <KpiCard
          label="New leads" icon={Users} loading={outreach.isLoading}
          value={o ? fmtNum(o.current.leads) : "—"}
          trend={o ? pctChange(o.current.leads, o.previous.leads) : undefined}
          spark={spark("leads")}
        />
        <KpiCard
          label="Email opens" icon={TrendingUp} loading={outreach.isLoading}
          value={o ? fmtNum(o.current.opens) : "—"}
          trend={o ? pctChange(o.current.opens, o.previous.opens) : undefined}
          spark={spark("opens")}
          note="Real people only"
        />
        <KpiCard
          label="Social engagement" icon={Heart} loading={social.isLoading}
          value={s?.reported ? fmtNum(s.current.engagement) : "—"}
          trend={s?.reported ? pctChange(s.current.engagement, s.previous.engagement) : undefined}
          note={s ? `${s.posts} post${s.posts === 1 ? "" : "s"} published` : undefined}
        />
      </div>

      <InsightsStrip insights={insights} />

      <Tabs defaultValue="website" className="space-y-6">
        <TabsList>
          <TabsTrigger value="website">Website</TabsTrigger>
          <TabsTrigger value="outreach">Leads & outreach</TabsTrigger>
          <TabsTrigger value="social">Social</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="website">
          <WebsiteTab ga={ga} plugin={plugin} clientAccountId={clientAccountId} days={days} onOpenTab={onOpenTab} />
        </TabsContent>
        <TabsContent value="outreach">
          <OutreachTab data={o} loading={outreach.isLoading} failed={outreach.isError} days={days} onOpenTab={onOpenTab} />
        </TabsContent>
        <TabsContent value="social">
          <SocialTab clientAccountId={clientAccountId} summary={s} days={days} />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab snapshots={snapshots.data} loading={snapshots.isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
