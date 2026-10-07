import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { Loader2, TrendingUp, TrendingDown, Eye, MousePointer, Users, BarChart3, Target, Download, Sparkles, AlertTriangle, RefreshCw, Link2 } from "lucide-react";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { toast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import { PageHeader, StatCard, ModernCard, EmptyState, CollapsibleSection } from "./PortalUI";

interface Ga4Property {
  id: string;
  name: string;
}

interface AnalyticsMetrics {
  website_visits?: number;
  leads_generated?: number;
  email_opens?: number;
  email_clicks?: number;
  social_reach?: number;
  conversions?: number;
  [key: string]: number | undefined;
}

interface AnalyticsHighlights {
  items?: string[];
  [key: string]: string[] | undefined;
}

interface AnalyticsSnapshot {
  id: string;
  period_start: string;
  period_end: string;
  metrics: AnalyticsMetrics;
  highlights: AnalyticsHighlights | null;
}

interface ClientAnalyticsTabProps {
  clientAccountId: string;
  businessName?: string;
}

interface Ga4Token {
  id: string;
  page_id: string | null;
  token_metadata: { properties?: Ga4Property[]; selection_required?: boolean } | null;
}

export default function ClientAnalyticsTab({ clientAccountId, businessName }: ClientAnalyticsTabProps) {
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [gaToken, setGaToken] = useState<Ga4Token | null>(null);
  const [connectingGa, setConnectingGa] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [savingProperty, setSavingProperty] = useState(false);
  const gaPopupRef = useRef<Window | null>(null);

  useEffect(() => {
    fetchAnalytics();
    fetchGaToken();
    const channel = supabase
      .channel('client-analytics-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_analytics', filter: `client_account_id=eq.${clientAccountId}` }, () => fetchAnalytics())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientAccountId]);

  // Refetch when the "Connect Google Analytics" popup closes -- catches both
  // a completed connection and a cancelled one (nothing to do either way but
  // stop showing "Redirecting...").
  useEffect(() => {
    const onFocus = () => {
      if (gaPopupRef.current && gaPopupRef.current.closed) {
        gaPopupRef.current = null;
        setConnectingGa(false);
        fetchGaToken();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [clientAccountId]);

  const fetchGaToken = async () => {
    const { data } = await supabase
      .from("client_oauth_tokens")
      .select("id, page_id, token_metadata")
      .eq("client_id", clientAccountId)
      .eq("platform", "google_analytics")
      .maybeSingle();
    const token = (data as Ga4Token | null) ?? null;
    setGaToken(token);
    setSelectedProperty(token?.token_metadata?.properties?.[0]?.id ?? "");
  };

  const connectGoogleAnalytics = async () => {
    setConnectingGa(true);
    try {
      const { data: cfg, error } = await supabase.functions.invoke("oauth-config");
      if (error || !cfg?.google_analytics?.configured) {
        toast({ title: "Google Analytics connect isn't set up yet", description: "Ask your account manager to configure it.", variant: "destructive" });
        setConnectingGa(false);
        return;
      }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const redirectUri = `${supabaseUrl}/functions/v1/google-analytics-oauth-callback`;
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&access_type=offline&prompt=consent&client_id=${cfg.google_analytics.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${clientAccountId}&scope=${encodeURIComponent("https://www.googleapis.com/auth/analytics.readonly")}`;
      gaPopupRef.current = window.open(authUrl, "_blank", "width=600,height=700");
    } finally {
      // connectingGa stays true until the popup closes (see the focus effect above)
    }
  };

  const saveSelectedProperty = async () => {
    if (!selectedProperty) return;
    setSavingProperty(true);
    try {
      const { data, error } = await supabase.functions.invoke("select-ga4-property", {
        body: { client_account_id: clientAccountId, property_id: selectedProperty },
      });
      if (error || data?.error) throw new Error(data?.error || "Failed to save");
      toast({ title: "Google Analytics property connected" });
      await fetchGaToken();
    } catch (err) {
      toast({ title: "Couldn't save that property", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSavingProperty(false);
    }
  };

  const fetchAnalytics = async () => {
    setFetchFailed(false);
    try {
      const { data, error } = await supabase
        .from("client_analytics")
        .select("*")
        .eq("client_account_id", clientAccountId)
        .order("period_end", { ascending: false })
        .limit(12);

      if (error) throw error;
      setAnalytics((data || []).map(item => ({
        ...item,
        metrics: (item.metrics as AnalyticsMetrics) || {},
        highlights: item.highlights as AnalyticsHighlights | null,
      })));
    } catch (error) {
      console.error("Error fetching analytics:", error);
      setFetchFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number | undefined) => {
    if (num === undefined) return "—";
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const calculateTrend = (current: number | undefined, previous: number | undefined) => {
    if (current === undefined || previous === undefined || previous === 0) return null;
    return ((current - previous) / previous) * 100;
  };

  const generatePDF = () => {
    try {
      const doc = new jsPDF();
      const latestPeriod = analytics[0];
      const previousPeriod = analytics[1];
      const metrics = latestPeriod?.metrics || {};
      const previousMetrics = previousPeriod?.metrics || {};

      // Brand orange (hsl(24 95% 53%) from index.css --primary), matches the portal's own accent.
      const BRAND: [number, number, number] = [249, 112, 21];
      const INK: [number, number, number] = [33, 33, 33];
      const MUTED: [number, number, number] = [110, 110, 110];
      const PAGE_W = 210;
      const MARGIN = 20;

      // Header band
      doc.setFillColor(...BRAND);
      doc.rect(0, 0, PAGE_W, 38, "F");
      doc.setFontSize(22);
      doc.setTextColor(255, 255, 255);
      doc.text("Performance Report", MARGIN, 19);
      doc.setFontSize(11);
      doc.text(businessName || "Client Report", MARGIN, 28);
      if (latestPeriod) {
        doc.setFontSize(9);
        doc.text(
          `${format(new Date(latestPeriod.period_start), "MMM d")} – ${format(new Date(latestPeriod.period_end), "MMM d, yyyy")}`,
          MARGIN,
          34,
        );
      }

      doc.setFontSize(15);
      doc.setTextColor(...INK);
      doc.text("Key Metrics", MARGIN, 52);

      const getTrend = (current: number | undefined, previous: number | undefined) => {
        const trend = calculateTrend(current, previous);
        if (trend === null) return null;
        return { text: `${trend >= 0 ? "▲" : "▼"} ${Math.abs(trend).toFixed(0)}%`, positive: trend >= 0 };
      };

      const metricDefs: { label: string; value: number | undefined; previous: number | undefined }[] = [
        { label: "Website Visits", value: metrics.website_visits, previous: previousMetrics.website_visits },
        { label: "Leads Generated", value: metrics.leads_generated, previous: previousMetrics.leads_generated },
        { label: "Email Opens", value: metrics.email_opens, previous: previousMetrics.email_opens },
        { label: "Email Clicks", value: metrics.email_clicks, previous: previousMetrics.email_clicks },
        { label: "Social Reach", value: metrics.social_reach, previous: previousMetrics.social_reach },
        { label: "Conversions", value: metrics.conversions, previous: previousMetrics.conversions },
      ];

      const GUTTER = 7;
      const BOX_W = (PAGE_W - 2 * MARGIN - 2 * GUTTER) / 3;
      const BOX_H = 30;
      const GRID_TOP = 58;

      metricDefs.forEach((m, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = MARGIN + col * (BOX_W + GUTTER);
        const y = GRID_TOP + row * (BOX_H + GUTTER);

        doc.setFillColor(247, 247, 248);
        doc.setDrawColor(230, 230, 230);
        doc.roundedRect(x, y, BOX_W, BOX_H, 2, 2, "FD");

        doc.setFontSize(8.5);
        doc.setTextColor(...MUTED);
        doc.text(m.label.toUpperCase(), x + 5, y + 9);

        doc.setFontSize(17);
        doc.setTextColor(...INK);
        doc.text(formatNumber(m.value), x + 5, y + 20);

        const trend = getTrend(m.value, m.previous);
        if (trend) {
          doc.setFontSize(9);
          doc.setTextColor(...(trend.positive ? [22, 163, 74] : [220, 38, 38]));
          doc.text(trend.text, x + 5, y + 26);
        }
      });

      let cursorY = GRID_TOP + 2 * (BOX_H + GUTTER) + 6;

      const highlightItems = latestPeriod?.highlights?.items?.filter(Boolean) ?? [];
      if (highlightItems.length > 0) {
        doc.setFontSize(15);
        doc.setTextColor(...INK);
        doc.text("Highlights", MARGIN, cursorY);
        cursorY += 8;

        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        const maxWidth = PAGE_W - 2 * MARGIN - 6;
        for (const item of highlightItems) {
          const lines = doc.splitTextToSize(`•  ${item}`, maxWidth);
          doc.text(lines, MARGIN, cursorY);
          cursorY += lines.length * 5.5 + 2;
        }
        cursorY += 4;
      }

      // Footer
      doc.setDrawColor(225, 225, 225);
      doc.line(MARGIN, 280, PAGE_W - MARGIN, 280);
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(`${businessName || "Client"} · Orange Door Marketing`, MARGIN, 286);
      doc.text(`Generated ${format(new Date(), "MMMM d, yyyy")}`, PAGE_W - MARGIN, 286, { align: "right" });

      const fileName = `performance-report-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      doc.save(fileName);
      toast({ title: "Report Downloaded", description: "Your performance report has been saved." });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({ title: "Error", description: "Failed to generate report.", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
            <Loader2 className="h-7 w-7 text-primary-foreground animate-spin" />
          </div>
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (fetchFailed) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load your analytics"
        description="Something went wrong loading this page. Try again — if it keeps happening, let your team know."
        action={
          <Button onClick={fetchAnalytics}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        }
      />
    );
  }

  const properties = gaToken?.token_metadata?.properties ?? [];
  const needsPropertyPick = !!gaToken && !gaToken.page_id && properties.length > 0;
  const ga4Connected = !!gaToken?.page_id;

  const ga4ConnectCard = !ga4Connected && (
    <ModernCard className="p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-xl bg-primary/10"><Link2 className="h-5 w-5 text-primary" /></div>
        <div>
          <h3 className="font-semibold text-foreground">Connect Google Analytics</h3>
          <p className="text-sm text-muted-foreground">Pulls real website visit numbers automatically — no manual setup needed.</p>
        </div>
      </div>
      {needsPropertyPick ? (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <Select value={selectedProperty} onValueChange={setSelectedProperty}>
            <SelectTrigger className="sm:w-64"><SelectValue placeholder="Choose a property" /></SelectTrigger>
            <SelectContent>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={saveSelectedProperty} disabled={savingProperty || !selectedProperty}>
            {savingProperty ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Use this property
          </Button>
        </div>
      ) : (
        <Button onClick={connectGoogleAnalytics} disabled={connectingGa}>
          {connectingGa ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
          {connectingGa ? "Complete in the popup..." : "Connect Google Analytics"}
        </Button>
      )}
    </ModernCard>
  );

  if (analytics.length === 0) {
    return (
      <div className="space-y-6">
        {ga4ConnectCard}
        <EmptyState icon={BarChart3} title="No Analytics Yet" description="Performance data will appear here as campaigns run." />
      </div>
    );
  }

  const latestPeriod = analytics[0];
  const previousPeriod = analytics[1];
  const metrics = latestPeriod?.metrics || {};
  const previousMetrics = previousPeriod?.metrics || {};

  const chartData = [...analytics].reverse().map(period => ({
    name: format(new Date(period.period_start), "MMM"),
    visits: period.metrics?.website_visits || 0,
    leads: period.metrics?.leads_generated || 0,
    conversions: period.metrics?.conversions || 0,
  }));

  const MetricCardWithTrend = ({ label, value, previousValue, icon: Icon, index }: { label: string; value: number | undefined; previousValue: number | undefined; icon: typeof Eye; index: number }) => {
    const trend = calculateTrend(value, previousValue);
    const trendNum = trend !== null ? Math.round(trend) : undefined;
    return <StatCard label={label} value={formatNumber(value)} icon={Icon} trend={trendNum} index={index} />;
  };

  return (
    <div className="space-y-8">
      <PageHeader 
        title="Performance Analytics" 
        description={latestPeriod ? `Data for ${format(new Date(latestPeriod.period_start), "MMM d")} - ${format(new Date(latestPeriod.period_end), "MMM d, yyyy")}` : undefined}
        icon={BarChart3}
        action={
          <Button onClick={generatePDF} variant="outline" className="rounded-xl">
            <Download className="h-4 w-4 mr-2" />Download Report
          </Button>
        }
      />

      {ga4ConnectCard}

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCardWithTrend label="Website Visits" value={metrics.website_visits} previousValue={previousMetrics.website_visits} icon={Eye} index={0} />
        <MetricCardWithTrend label="Leads Generated" value={metrics.leads_generated} previousValue={previousMetrics.leads_generated} icon={Users} index={1} />
        <MetricCardWithTrend label="Email Opens" value={metrics.email_opens} previousValue={previousMetrics.email_opens} icon={TrendingUp} index={2} />
        <MetricCardWithTrend label="Email Clicks" value={metrics.email_clicks} previousValue={previousMetrics.email_clicks} icon={MousePointer} index={3} />
        <MetricCardWithTrend label="Social Reach" value={metrics.social_reach} previousValue={previousMetrics.social_reach} icon={Users} index={4} />
        <MetricCardWithTrend label="Conversions" value={metrics.conversions} previousValue={previousMetrics.conversions} icon={Target} index={5} />
      </div>

      {/* Charts */}
      {chartData.length > 1 && (
        <div className="grid md:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <ModernCard className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl bg-primary/10"><Eye className="h-5 w-5 text-primary" /></div>
                <div>
                  <h3 className="font-semibold text-foreground">Website Traffic Trend</h3>
                  <p className="text-sm text-muted-foreground">Monthly website visits over time</p>
                </div>
              </div>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px' }} />
                    <Area type="monotone" dataKey="visits" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorVisits)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ModernCard>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <ModernCard className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl bg-emerald-500/10"><Target className="h-5 w-5 text-emerald-500" /></div>
                <div>
                  <h3 className="font-semibold text-foreground">Leads & Conversions</h3>
                  <p className="text-sm text-muted-foreground">Monthly leads and conversion trends</p>
                </div>
              </div>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px' }} />
                    <Line type="monotone" dataKey="leads" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))' }} />
                    <Line type="monotone" dataKey="conversions" stroke="hsl(142.1 76.2% 36.3%)" strokeWidth={2} dot={{ fill: 'hsl(142.1 76.2% 36.3%)' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-6 mt-4 text-sm">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-primary" /><span className="text-muted-foreground">Leads</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500" /><span className="text-muted-foreground">Conversions</span></div>
              </div>
            </ModernCard>
          </motion.div>
        </div>
      )}

      {/* Highlights */}
      {latestPeriod?.highlights?.items && latestPeriod.highlights.items.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <ModernCard className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-xl bg-amber-500/10"><Sparkles className="h-5 w-5 text-amber-500" /></div>
              <div>
                <h3 className="font-semibold text-foreground">Key Highlights</h3>
                <p className="text-sm text-muted-foreground">Notable achievements this period</p>
              </div>
            </div>
            <div className="space-y-3">
              {latestPeriod.highlights.items.map((highlight, index) => (
                <motion.div 
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-r from-amber-500/5 to-orange-500/5 border border-amber-500/10"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                    <span className="text-xs font-bold text-white">{index + 1}</span>
                  </div>
                  <p className="text-foreground pt-1">{highlight}</p>
                </motion.div>
              ))}
            </div>
          </ModernCard>
        </motion.div>
      )}
    </div>
  );
}
