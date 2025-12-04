import { useState, useEffect, useMemo } from "react";
import { format, subDays, differenceInDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { 
  RefreshCw, AlertTriangle, CheckCircle, XCircle, Shield, 
  TrendingDown, TrendingUp, Mail, AlertCircle, Activity,
  Globe, Server, Clock
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import type { Json } from "@/integrations/supabase/types";

interface EmailLog {
  id: string;
  recipient_email: string;
  subject: string;
  status: string;
  sent_at: string;
}

interface TrackingEvent {
  id: string;
  email_log_id: string;
  event_type: string;
  created_at: string;
  metadata: Json;
}

interface EmailDeliverabilityDashboardProps {
  password: string;
}

// Alert thresholds
const THRESHOLDS = {
  bounceRate: { warning: 2, critical: 5 },
  complaintRate: { warning: 0.1, critical: 0.5 },
  deliveryRate: { warning: 95, critical: 90 },
};

export const EmailDeliverabilityDashboard = ({ password }: EmailDeliverabilityDashboardProps) => {
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [trackingEvents, setTrackingEvents] = useState<TrackingEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [logsResponse, trackingResponse] = await Promise.all([
        supabase.functions.invoke("admin", {
          body: { action: "list", table: "email_logs", password },
        }),
        supabase.functions.invoke("admin", {
          body: { action: "list_tracking_events", password },
        }),
      ]);

      if (logsResponse.data?.data) setEmailLogs(logsResponse.data.data);
      if (trackingResponse.data?.data) setTrackingEvents(trackingResponse.data.data);
    } catch (error) {
      console.error("Error fetching deliverability data:", error);
      toast({ title: "Error", description: "Failed to fetch deliverability data", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [password]);

  // Calculate deliverability metrics
  const metrics = useMemo(() => {
    const last30Days = subDays(new Date(), 30);
    const last7Days = subDays(new Date(), 7);

    const recentLogs = emailLogs.filter(log => new Date(log.sent_at) >= last30Days);
    const weekLogs = emailLogs.filter(log => new Date(log.sent_at) >= last7Days);

    const totalSent = recentLogs.length;
    const weekSent = weekLogs.length;

    // Count events by type
    const recentEvents = trackingEvents.filter(e => new Date(e.created_at) >= last30Days);
    const weekEvents = trackingEvents.filter(e => new Date(e.created_at) >= last7Days);

    const bounces = recentEvents.filter(e => e.event_type === "bounced").length;
    const complaints = recentEvents.filter(e => e.event_type === "complained").length;
    const delivered = recentEvents.filter(e => e.event_type === "delivered").length;
    const opens = new Set(recentEvents.filter(e => e.event_type === "open").map(e => e.email_log_id)).size;

    const weekBounces = weekEvents.filter(e => e.event_type === "bounced").length;
    const weekComplaints = weekEvents.filter(e => e.event_type === "complained").length;

    // Previous period for comparison
    const prev30Days = subDays(new Date(), 60);
    const prevLogs = emailLogs.filter(log => {
      const date = new Date(log.sent_at);
      return date >= prev30Days && date < last30Days;
    });
    const prevEvents = trackingEvents.filter(e => {
      const date = new Date(e.created_at);
      return date >= prev30Days && date < last30Days;
    });
    const prevBounces = prevEvents.filter(e => e.event_type === "bounced").length;

    const bounceRate = totalSent > 0 ? (bounces / totalSent) * 100 : 0;
    const complaintRate = totalSent > 0 ? (complaints / totalSent) * 100 : 0;
    const deliveryRate = totalSent > 0 ? (delivered / totalSent) * 100 : 100;
    const openRate = totalSent > 0 ? (opens / totalSent) * 100 : 0;

    const prevBounceRate = prevLogs.length > 0 ? (prevBounces / prevLogs.length) * 100 : 0;
    const bounceRateTrend = bounceRate - prevBounceRate;

    return {
      totalSent,
      weekSent,
      bounces,
      complaints,
      delivered,
      bounceRate,
      complaintRate,
      deliveryRate,
      openRate,
      bounceRateTrend,
      weekBounces,
      weekComplaints,
    };
  }, [emailLogs, trackingEvents]);

  // Domain health by sender domain
  const domainHealth = useMemo(() => {
    const domains: Record<string, {
      domain: string;
      sent: number;
      delivered: number;
      bounced: number;
      complained: number;
      deliveryRate: number;
      bounceRate: number;
      complaintRate: number;
      health: "good" | "warning" | "critical";
    }> = {};

    emailLogs.forEach(log => {
      const email = log.recipient_email;
      const domain = email.split("@")[1] || "unknown";
      
      if (!domains[domain]) {
        domains[domain] = {
          domain,
          sent: 0,
          delivered: 0,
          bounced: 0,
          complained: 0,
          deliveryRate: 100,
          bounceRate: 0,
          complaintRate: 0,
          health: "good",
        };
      }
      domains[domain].sent++;
    });

    trackingEvents.forEach(event => {
      const log = emailLogs.find(l => l.id === event.email_log_id);
      if (log) {
        const domain = log.recipient_email.split("@")[1] || "unknown";
        if (domains[domain]) {
          if (event.event_type === "delivered") domains[domain].delivered++;
          if (event.event_type === "bounced") domains[domain].bounced++;
          if (event.event_type === "complained") domains[domain].complained++;
        }
      }
    });

    // Calculate rates and health
    Object.values(domains).forEach(d => {
      if (d.sent > 0) {
        d.deliveryRate = (d.delivered / d.sent) * 100;
        d.bounceRate = (d.bounced / d.sent) * 100;
        d.complaintRate = (d.complained / d.sent) * 100;
      }

      if (d.bounceRate >= THRESHOLDS.bounceRate.critical || d.complaintRate >= THRESHOLDS.complaintRate.critical) {
        d.health = "critical";
      } else if (d.bounceRate >= THRESHOLDS.bounceRate.warning || d.complaintRate >= THRESHOLDS.complaintRate.warning) {
        d.health = "warning";
      } else {
        d.health = "good";
      }
    });

    return Object.values(domains)
      .filter(d => d.sent >= 5) // Only show domains with 5+ emails
      .sort((a, b) => b.sent - a.sent)
      .slice(0, 15);
  }, [emailLogs, trackingEvents]);

  // Bounce trend over time
  const bounceTrend = useMemo(() => {
    const days: Record<string, { date: string; sent: number; bounced: number; bounceRate: number }> = {};
    
    for (let i = 29; i >= 0; i--) {
      const date = format(subDays(new Date(), i), "yyyy-MM-dd");
      const displayDate = format(subDays(new Date(), i), "MMM d");
      days[date] = { date: displayDate, sent: 0, bounced: 0, bounceRate: 0 };
    }

    emailLogs.forEach(log => {
      const date = format(new Date(log.sent_at), "yyyy-MM-dd");
      if (days[date]) days[date].sent++;
    });

    trackingEvents.forEach(event => {
      if (event.event_type === "bounced") {
        const date = format(new Date(event.created_at), "yyyy-MM-dd");
        if (days[date]) days[date].bounced++;
      }
    });

    return Object.values(days).map(d => ({
      ...d,
      bounceRate: d.sent > 0 ? parseFloat(((d.bounced / d.sent) * 100).toFixed(2)) : 0,
    }));
  }, [emailLogs, trackingEvents]);

  // Recent bounce details
  const recentBounces = useMemo(() => {
    return trackingEvents
      .filter(e => e.event_type === "bounced")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map(event => {
        const log = emailLogs.find(l => l.id === event.email_log_id);
        const metadata = event.metadata as { bounce_message?: string } | null;
        return {
          ...event,
          email: log?.recipient_email || "Unknown",
          subject: log?.subject || "Unknown",
          bounceMessage: metadata?.bounce_message || "No details available",
        };
      });
  }, [trackingEvents, emailLogs]);

  // Recent complaints
  const recentComplaints = useMemo(() => {
    return trackingEvents
      .filter(e => e.event_type === "complained")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map(event => {
        const log = emailLogs.find(l => l.id === event.email_log_id);
        const metadata = event.metadata as { feedback_type?: string } | null;
        return {
          ...event,
          email: log?.recipient_email || "Unknown",
          subject: log?.subject || "Unknown",
          feedbackType: metadata?.feedback_type || "Unknown",
        };
      });
  }, [trackingEvents, emailLogs]);

  // Alerts
  const alerts = useMemo(() => {
    const alertList: { type: "warning" | "critical"; title: string; message: string }[] = [];

    if (metrics.bounceRate >= THRESHOLDS.bounceRate.critical) {
      alertList.push({
        type: "critical",
        title: "Critical: High Bounce Rate",
        message: `Your bounce rate is ${metrics.bounceRate.toFixed(2)}%, which exceeds the ${THRESHOLDS.bounceRate.critical}% critical threshold. This may impact your sender reputation.`,
      });
    } else if (metrics.bounceRate >= THRESHOLDS.bounceRate.warning) {
      alertList.push({
        type: "warning",
        title: "Warning: Elevated Bounce Rate",
        message: `Your bounce rate is ${metrics.bounceRate.toFixed(2)}%, approaching the ${THRESHOLDS.bounceRate.critical}% critical threshold.`,
      });
    }

    if (metrics.complaintRate >= THRESHOLDS.complaintRate.critical) {
      alertList.push({
        type: "critical",
        title: "Critical: High Complaint Rate",
        message: `Your complaint rate is ${metrics.complaintRate.toFixed(3)}%, which exceeds the ${THRESHOLDS.complaintRate.critical}% critical threshold. Immediate action required.`,
      });
    } else if (metrics.complaintRate >= THRESHOLDS.complaintRate.warning) {
      alertList.push({
        type: "warning",
        title: "Warning: Elevated Complaint Rate",
        message: `Your complaint rate is ${metrics.complaintRate.toFixed(3)}%, approaching the ${THRESHOLDS.complaintRate.critical}% critical threshold.`,
      });
    }

    if (metrics.weekBounces > 0 && metrics.bounceRateTrend > 1) {
      alertList.push({
        type: "warning",
        title: "Bounce Rate Increasing",
        message: `Bounce rate increased by ${metrics.bounceRateTrend.toFixed(2)}% compared to previous period.`,
      });
    }

    return alertList;
  }, [metrics]);

  // Overall health score (0-100)
  const healthScore = useMemo(() => {
    let score = 100;
    
    // Deduct for bounce rate
    if (metrics.bounceRate > 0) {
      score -= Math.min(metrics.bounceRate * 5, 30);
    }
    
    // Deduct for complaint rate
    if (metrics.complaintRate > 0) {
      score -= Math.min(metrics.complaintRate * 20, 30);
    }
    
    // Deduct for low delivery rate
    if (metrics.deliveryRate < 100) {
      score -= Math.min((100 - metrics.deliveryRate) * 0.5, 20);
    }

    // Bonus for good open rates
    if (metrics.openRate > 20) {
      score = Math.min(score + 5, 100);
    }

    return Math.max(0, Math.round(score));
  }, [metrics]);

  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    return "text-red-400";
  };

  const getHealthLabel = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    return "Poor";
  };

  const getDomainHealthBadge = (health: string) => {
    switch (health) {
      case "good":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Good</Badge>;
      case "warning":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Warning</Badge>;
      case "critical":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Critical</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Email Deliverability</h2>
          <p className="text-sm text-muted-foreground">Monitor bounce rates, complaints, and domain reputation</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert, index) => (
            <Alert key={index} variant={alert.type === "critical" ? "destructive" : "default"} className={
              alert.type === "critical" 
                ? "border-red-500/50 bg-red-500/10" 
                : "border-yellow-500/50 bg-yellow-500/10"
            }>
              {alert.type === "critical" ? (
                <XCircle className="h-4 w-4 text-red-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
              )}
              <AlertTitle className={alert.type === "critical" ? "text-red-400" : "text-yellow-400"}>
                {alert.title}
              </AlertTitle>
              <AlertDescription className="text-muted-foreground">
                {alert.message}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Health Score & Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-card border-primary/20 md:col-span-1">
          <CardContent className="p-6 flex flex-col items-center justify-center h-full">
            <Shield className={`w-10 h-10 mb-2 ${getHealthColor(healthScore)}`} />
            <p className={`text-4xl font-bold ${getHealthColor(healthScore)}`}>{healthScore}</p>
            <p className="text-sm text-muted-foreground">Health Score</p>
            <Badge className={`mt-2 ${
              healthScore >= 80 ? "bg-green-500/20 text-green-400" :
              healthScore >= 60 ? "bg-yellow-500/20 text-yellow-400" :
              "bg-red-500/20 text-red-400"
            }`}>
              {getHealthLabel(healthScore)}
            </Badge>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{metrics.deliveryRate.toFixed(1)}%</p>
                <p className="text-sm text-muted-foreground">Delivery Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/20">
                  <XCircle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{metrics.bounceRate.toFixed(2)}%</p>
                  <p className="text-sm text-muted-foreground">Bounce Rate</p>
                </div>
              </div>
              {metrics.bounceRateTrend !== 0 && (
                <div className={`flex items-center text-xs ${metrics.bounceRateTrend > 0 ? "text-red-400" : "text-green-400"}`}>
                  {metrics.bounceRateTrend > 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                  {Math.abs(metrics.bounceRateTrend).toFixed(1)}%
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/20">
                <AlertCircle className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{metrics.complaintRate.toFixed(3)}%</p>
                <p className="text-sm text-muted-foreground">Complaint Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Mail className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{metrics.totalSent}</p>
                <p className="text-sm text-muted-foreground">Sent (30d)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bounce Rate Trend */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Bounce Rate Trend (30 Days)
          </CardTitle>
          <CardDescription>Daily bounce rate over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bounceTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={4} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 'auto']} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value: number) => [`${value}%`, "Bounce Rate"]}
                />
                <defs>
                  <linearGradient id="bounceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area 
                  type="monotone" 
                  dataKey="bounceRate" 
                  stroke="hsl(0, 84%, 60%)" 
                  strokeWidth={2}
                  fill="url(#bounceGradient)"
                />
                {/* Warning threshold line */}
                <Line 
                  type="monotone" 
                  dataKey={() => THRESHOLDS.bounceRate.warning} 
                  stroke="hsl(45, 93%, 47%)" 
                  strokeDasharray="5 5"
                  dot={false}
                  name="Warning"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-red-500" />
              <span>Bounce Rate</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-yellow-500" style={{ borderStyle: "dashed" }} />
              <span>Warning Threshold ({THRESHOLDS.bounceRate.warning}%)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Domain Health */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Domain Reputation
          </CardTitle>
          <CardDescription>Deliverability metrics by recipient domain</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead className="text-center">Sent</TableHead>
                  <TableHead className="text-center">Delivered</TableHead>
                  <TableHead className="text-center">Bounce Rate</TableHead>
                  <TableHead className="text-center">Complaints</TableHead>
                  <TableHead>Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domainHealth.length > 0 ? (
                  domainHealth.map((domain) => (
                    <TableRow key={domain.domain}>
                      <TableCell className="font-medium">{domain.domain}</TableCell>
                      <TableCell className="text-center">{domain.sent}</TableCell>
                      <TableCell className="text-center text-green-400">{domain.delivered}</TableCell>
                      <TableCell className="text-center">
                        <span className={domain.bounceRate >= THRESHOLDS.bounceRate.warning ? "text-red-400" : ""}>
                          {domain.bounceRate.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={domain.complained > 0 ? "text-orange-400" : ""}>
                          {domain.complained}
                        </span>
                      </TableCell>
                      <TableCell>{getDomainHealthBadge(domain.health)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No domain data yet (minimum 5 emails per domain)
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recent Issues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Bounces */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400" />
              Recent Bounces
            </CardTitle>
            <CardDescription>Latest bounced emails with details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {recentBounces.length > 0 ? (
                recentBounces.map((bounce) => (
                  <div key={bounce.id} className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{bounce.email}</p>
                        <p className="text-xs text-muted-foreground truncate">{bounce.subject}</p>
                        <p className="text-xs text-red-400 mt-1">{bounce.bounceMessage}</p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                        {format(new Date(bounce.created_at), "MMM d, HH:mm")}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                  <p>No recent bounces</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Complaints */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              Recent Complaints
            </CardTitle>
            <CardDescription>Spam complaints from recipients</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {recentComplaints.length > 0 ? (
                recentComplaints.map((complaint) => (
                  <div key={complaint.id} className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{complaint.email}</p>
                        <p className="text-xs text-muted-foreground truncate">{complaint.subject}</p>
                        <Badge className="mt-1 bg-orange-500/20 text-orange-400 text-xs">
                          {complaint.feedbackType}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                        {format(new Date(complaint.created_at), "MMM d, HH:mm")}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                  <p>No recent complaints</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Best Practices */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Deliverability Best Practices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-3 rounded-lg bg-muted/30">
              <h4 className="font-medium mb-1 flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-400" />
                Keep Bounce Rate Below 2%
              </h4>
              <p className="text-muted-foreground text-xs">
                Clean your list regularly, use double opt-in, and validate emails before sending.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30">
              <h4 className="font-medium mb-1 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-400" />
                Complaint Rate Below 0.1%
              </h4>
              <p className="text-muted-foreground text-xs">
                Make unsubscribe easy, only email opted-in users, and send relevant content.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30">
              <h4 className="font-medium mb-1 flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-400" />
                Monitor Domain Reputation
              </h4>
              <p className="text-muted-foreground text-xs">
                Check Google Postmaster Tools and watch for sudden delivery drops to major providers.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
