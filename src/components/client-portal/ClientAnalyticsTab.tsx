import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, TrendingDown, Eye, MousePointer, Users, BarChart3, Target } from "lucide-react";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

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
}

export default function ClientAnalyticsTab({ clientAccountId }: ClientAnalyticsTabProps) {
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
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
