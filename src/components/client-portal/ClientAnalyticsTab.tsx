import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, Eye, MousePointer, Users, BarChart3 } from "lucide-react";
import { format } from "date-fns";

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
  const metrics = latestPeriod?.metrics || {};

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
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Eye className="h-4 w-4" />
              <span className="text-xs font-medium">Website Visits</span>
            </div>
            <p className="text-2xl font-bold">{formatNumber(metrics.website_visits)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Users className="h-4 w-4" />
              <span className="text-xs font-medium">Leads Generated</span>
            </div>
            <p className="text-2xl font-bold">{formatNumber(metrics.leads_generated)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium">Email Opens</span>
            </div>
            <p className="text-2xl font-bold">{formatNumber(metrics.email_opens)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <MousePointer className="h-4 w-4" />
              <span className="text-xs font-medium">Email Clicks</span>
            </div>
            <p className="text-2xl font-bold">{formatNumber(metrics.email_clicks)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Users className="h-4 w-4" />
              <span className="text-xs font-medium">Social Reach</span>
            </div>
            <p className="text-2xl font-bold">{formatNumber(metrics.social_reach)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium">Conversions</span>
            </div>
            <p className="text-2xl font-bold">{formatNumber(metrics.conversions)}</p>
          </CardContent>
        </Card>
      </div>

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
