import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Loader2, TrendingUp, TrendingDown, Eye, MousePointer, Users, BarChart3, Target, Download, Sparkles, AlertTriangle, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { toast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PageHeader, StatCard, ModernCard, EmptyState, CollapsibleSection } from "./PortalUI";

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

export default function ClientAnalyticsTab({ clientAccountId, businessName }: ClientAnalyticsTabProps) {
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);

  useEffect(() => {
    fetchAnalytics();
    const channel = supabase
      .channel('client-analytics-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_analytics', filter: `client_account_id=eq.${clientAccountId}` }, () => fetchAnalytics())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientAccountId]);

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
      
      doc.setFontSize(24);
      doc.setTextColor(33, 33, 33);
      doc.text("Performance Report", 20, 25);
      
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);
      doc.text(businessName || "Client Report", 20, 35);
      
      if (latestPeriod) {
        doc.text(`Period: ${format(new Date(latestPeriod.period_start), "MMM d")} - ${format(new Date(latestPeriod.period_end), "MMM d, yyyy")}`, 20, 42);
      }
      
      doc.text(`Generated: ${format(new Date(), "MMMM d, yyyy")}`, 20, 49);
      doc.setDrawColor(200, 200, 200);
      doc.line(20, 55, 190, 55);
      
      doc.setFontSize(16);
      doc.setTextColor(33, 33, 33);
      doc.text("Key Metrics", 20, 68);
      
      const getTrendText = (current: number | undefined, previous: number | undefined) => {
        const trend = calculateTrend(current, previous);
        if (trend === null) return "—";
        return `${trend >= 0 ? "+" : ""}${trend.toFixed(0)}%`;
      };
      
      const metricsData = [
        ["Metric", "Current", "Previous", "Change"],
        ["Website Visits", formatNumber(metrics.website_visits), formatNumber(previousMetrics.website_visits), getTrendText(metrics.website_visits, previousMetrics.website_visits)],
        ["Leads Generated", formatNumber(metrics.leads_generated), formatNumber(previousMetrics.leads_generated), getTrendText(metrics.leads_generated, previousMetrics.leads_generated)],
        ["Email Opens", formatNumber(metrics.email_opens), formatNumber(previousMetrics.email_opens), getTrendText(metrics.email_opens, previousMetrics.email_opens)],
        ["Email Clicks", formatNumber(metrics.email_clicks), formatNumber(previousMetrics.email_clicks), getTrendText(metrics.email_clicks, previousMetrics.email_clicks)],
        ["Social Reach", formatNumber(metrics.social_reach), formatNumber(previousMetrics.social_reach), getTrendText(metrics.social_reach, previousMetrics.social_reach)],
        ["Conversions", formatNumber(metrics.conversions), formatNumber(previousMetrics.conversions), getTrendText(metrics.conversions, previousMetrics.conversions)],
      ];
      
      autoTable(doc, {
        head: [metricsData[0]],
        body: metricsData.slice(1),
        startY: 75,
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246], textColor: 255 },
        styles: { fontSize: 10 },
      });
      
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

  if (analytics.length === 0) {
    return <EmptyState icon={BarChart3} title="No Analytics Yet" description="Performance data will appear here as campaigns run." />;
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
