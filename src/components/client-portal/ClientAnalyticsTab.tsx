import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, TrendingDown, Eye, MousePointer, Users, BarChart3, Target, Download } from "lucide-react";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { toast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

  useEffect(() => {
    fetchAnalytics();

    // Subscribe to real-time updates for analytics
    const channel = supabase
      .channel('client-analytics-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_analytics',
          filter: `client_account_id=eq.${clientAccountId}`,
        },
        () => {
          console.log('Analytics updated, refreshing...');
          fetchAnalytics();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientAccountId]);

  const fetchAnalytics = async () => {
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
    const change = ((current - previous) / previous) * 100;
    return change;
  };

  const generatePDF = () => {
    try {
      const doc = new jsPDF();
      const latestPeriod = analytics[0];
      const previousPeriod = analytics[1];
      const metrics = latestPeriod?.metrics || {};
      const previousMetrics = previousPeriod?.metrics || {};
      
      // Header
      doc.setFontSize(24);
      doc.setTextColor(33, 33, 33);
      doc.text("Performance Report", 20, 25);
      
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);
      doc.text(businessName || "Client Report", 20, 35);
      
      if (latestPeriod) {
        doc.text(
          `Period: ${format(new Date(latestPeriod.period_start), "MMM d")} - ${format(new Date(latestPeriod.period_end), "MMM d, yyyy")}`,
          20,
          42
        );
      }
      
      doc.text(`Generated: ${format(new Date(), "MMMM d, yyyy")}`, 20, 49);
      
      // Divider
      doc.setDrawColor(200, 200, 200);
      doc.line(20, 55, 190, 55);
      
      // Key Metrics Section
      doc.setFontSize(16);
      doc.setTextColor(33, 33, 33);
      doc.text("Key Metrics", 20, 68);
      
      const metricsData = [
        ["Metric", "Current", "Previous", "Change"],
        [
          "Website Visits",
          formatNumber(metrics.website_visits),
          formatNumber(previousMetrics.website_visits),
          getTrendText(metrics.website_visits, previousMetrics.website_visits),
        ],
        [
          "Leads Generated",
          formatNumber(metrics.leads_generated),
          formatNumber(previousMetrics.leads_generated),
          getTrendText(metrics.leads_generated, previousMetrics.leads_generated),
        ],
        [
          "Email Opens",
          formatNumber(metrics.email_opens),
          formatNumber(previousMetrics.email_opens),
          getTrendText(metrics.email_opens, previousMetrics.email_opens),
        ],
        [
          "Email Clicks",
          formatNumber(metrics.email_clicks),
          formatNumber(previousMetrics.email_clicks),
          getTrendText(metrics.email_clicks, previousMetrics.email_clicks),
        ],
        [
          "Social Reach",
          formatNumber(metrics.social_reach),
          formatNumber(previousMetrics.social_reach),
          getTrendText(metrics.social_reach, previousMetrics.social_reach),
        ],
        [
          "Conversions",
          formatNumber(metrics.conversions),
          formatNumber(previousMetrics.conversions),
          getTrendText(metrics.conversions, previousMetrics.conversions),
        ],
      ];
      
      autoTable(doc, {
        head: [metricsData[0]],
        body: metricsData.slice(1),
        startY: 75,
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246], textColor: 255 },
        styles: { fontSize: 10 },
        columnStyles: {
          3: { halign: "center" },
        },
      });
      
      // Highlights Section
      if (latestPeriod?.highlights?.items && latestPeriod.highlights.items.length > 0) {
        const finalY = (doc as any).lastAutoTable?.finalY || 130;
        
        doc.setFontSize(16);
        doc.setTextColor(33, 33, 33);
        doc.text("Key Highlights", 20, finalY + 15);
        
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        latestPeriod.highlights.items.forEach((highlight, index) => {
          doc.text(`• ${highlight}`, 25, finalY + 25 + index * 8);
        });
      }
      
      // Historical Performance
      if (analytics.length > 1) {
        const highlightsHeight = latestPeriod?.highlights?.items ? latestPeriod.highlights.items.length * 8 + 30 : 0;
        const historyStartY = ((doc as any).lastAutoTable?.finalY || 130) + highlightsHeight + 15;
        
        doc.setFontSize(16);
        doc.setTextColor(33, 33, 33);
        doc.text("Historical Performance", 20, historyStartY);
        
        const historyData = analytics.slice(0, 6).map((period) => [
          `${format(new Date(period.period_start), "MMM d")} - ${format(new Date(period.period_end), "MMM d, yyyy")}`,
          formatNumber(period.metrics?.website_visits),
          formatNumber(period.metrics?.leads_generated),
          formatNumber(period.metrics?.conversions),
        ]);
        
        autoTable(doc, {
          head: [["Period", "Visits", "Leads", "Conversions"]],
          body: historyData,
          startY: historyStartY + 7,
          theme: "striped",
          headStyles: { fillColor: [59, 130, 246], textColor: 255 },
          styles: { fontSize: 9 },
        });
      }
      
      // Footer
      const pageHeight = doc.internal.pageSize.height;
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("This report was generated automatically from your client portal.", 20, pageHeight - 15);
      doc.text("Orange Door Marketing | orangedoormarketing.com", 20, pageHeight - 10);
      
      // Save the PDF
      const fileName = `performance-report-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      doc.save(fileName);
      
      toast({
        title: "Report Downloaded",
        description: "Your performance report has been saved.",
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        title: "Error",
        description: "Failed to generate report. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const getTrendText = (current: number | undefined, previous: number | undefined) => {
    const trend = calculateTrend(current, previous);
    if (trend === null) return "—";
    const sign = trend >= 0 ? "+" : "";
    return `${sign}${trend.toFixed(0)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (analytics.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground">No Analytics Yet</h3>
          <p className="text-muted-foreground">Performance data will appear here as campaigns run.</p>
        </CardContent>
      </Card>
    );
  }

  const latestPeriod = analytics[0];
  const previousPeriod = analytics[1];
  const metrics = latestPeriod?.metrics || {};
  const previousMetrics = previousPeriod?.metrics || {};

  // Prepare chart data (reversed for chronological order)
  const chartData = [...analytics].reverse().map(period => ({
    name: format(new Date(period.period_start), "MMM"),
    visits: period.metrics?.website_visits || 0,
    leads: period.metrics?.leads_generated || 0,
    conversions: period.metrics?.conversions || 0,
  }));

  const MetricCard = ({ 
    label, 
    value, 
    previousValue, 
    icon: Icon 
  }: { 
    label: string; 
    value: number | undefined; 
    previousValue: number | undefined; 
    icon: React.ElementType;
  }) => {
    const trend = calculateTrend(value, previousValue);
    const isPositive = trend !== null && trend >= 0;
    
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon className="h-4 w-4" />
              <span className="text-xs font-medium">{label}</span>
            </div>
            {trend !== null && (
              <div className={`flex items-center gap-1 text-xs ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
                {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                <span>{Math.abs(trend).toFixed(0)}%</span>
              </div>
            )}
          </div>
          <p className="text-2xl font-bold">{formatNumber(value)}</p>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Performance Analytics</h2>
          <p className="text-muted-foreground">
            {latestPeriod && (
              <>
                Data for {format(new Date(latestPeriod.period_start), "MMM d")} - {format(new Date(latestPeriod.period_end), "MMM d, yyyy")}
              </>
            )}
          </p>
        </div>
        <Button onClick={generatePDF} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Download Report
        </Button>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard 
          label="Website Visits" 
          value={metrics.website_visits} 
          previousValue={previousMetrics.website_visits}
          icon={Eye} 
        />
        <MetricCard 
          label="Leads Generated" 
          value={metrics.leads_generated} 
          previousValue={previousMetrics.leads_generated}
          icon={Users} 
        />
        <MetricCard 
          label="Email Opens" 
          value={metrics.email_opens} 
          previousValue={previousMetrics.email_opens}
          icon={TrendingUp} 
        />
        <MetricCard 
          label="Email Clicks" 
          value={metrics.email_clicks} 
          previousValue={previousMetrics.email_clicks}
          icon={MousePointer} 
        />
        <MetricCard 
          label="Social Reach" 
          value={metrics.social_reach} 
          previousValue={previousMetrics.social_reach}
          icon={Users} 
        />
        <MetricCard 
          label="Conversions" 
          value={metrics.conversions} 
          previousValue={previousMetrics.conversions}
          icon={Target} 
        />
      </div>

      {/* Trend Charts */}
      {chartData.length > 1 && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Website Traffic Trend</CardTitle>
              <CardDescription>Monthly website visits over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="visits" 
                      stroke="hsl(var(--primary))" 
                      fillOpacity={1} 
                      fill="url(#colorVisits)" 
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Leads & Conversions</CardTitle>
              <CardDescription>Monthly leads and conversion trends</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="leads" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--primary))' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="conversions" 
                      stroke="hsl(142.1 76.2% 36.3%)" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(142.1 76.2% 36.3%)' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-6 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary" />
                  <span className="text-muted-foreground">Leads</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(142.1 76.2% 36.3%)' }} />
                  <span className="text-muted-foreground">Conversions</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Highlights */}
      {latestPeriod?.highlights?.items && latestPeriod.highlights.items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Key Highlights</CardTitle>
            <CardDescription>Notable achievements this period</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {latestPeriod.highlights.items.map((highlight, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span className="text-sm">{highlight}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Historical Data */}
      {analytics.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Historical Performance</CardTitle>
            <CardDescription>Past reporting periods</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.slice(1).map((period) => (
                <div 
                  key={period.id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <span className="text-sm font-medium">
                    {format(new Date(period.period_start), "MMM d")} - {format(new Date(period.period_end), "MMM d, yyyy")}
                  </span>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>{formatNumber(period.metrics?.website_visits)} visits</span>
                    <span>{formatNumber(period.metrics?.leads_generated)} leads</span>
                    <span>{formatNumber(period.metrics?.conversions)} conversions</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
