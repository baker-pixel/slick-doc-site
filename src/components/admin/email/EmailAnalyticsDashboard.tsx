import { useState, useEffect, useMemo } from "react";
import { format, subDays, parseISO, getDay, getHours } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { RefreshCw, TrendingUp, Users, MousePointerClick, Eye, Mail, Clock, Calendar, Link2, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, Cell, PieChart, Pie } from "recharts";
import type { Json } from "@/integrations/supabase/types";

interface EmailLog {
  id: string;
  recipient_email: string;
  subject: string;
  status: string;
  sent_at: string;
  tracking_id?: string;
}

interface TrackingEvent {
  id: string;
  email_log_id: string;
  event_type: string;
  link_url: string | null;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

interface EmailAnalyticsDashboardProps {
  password: string;
}

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS_OF_DAY = Array.from({ length: 24 }, (_, i) => i);

export const EmailAnalyticsDashboard = ({ password }: EmailAnalyticsDashboardProps) => {
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [trackingEvents, setTrackingEvents] = useState<TrackingEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dateRange, setDateRange] = useState<"7" | "14" | "30" | "90">("30");

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

      if (logsResponse.error) {
        const msg = await getEdgeErrorMessage(logsResponse.error, logsResponse.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to fetch analytics data");
      }
      if (trackingResponse.error) {
        const msg = await getEdgeErrorMessage(trackingResponse.error, trackingResponse.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to fetch analytics data");
      }

      if (logsResponse.data?.data) setEmailLogs(logsResponse.data.data);
      if (trackingResponse.data?.data) setTrackingEvents(trackingResponse.data.data);
    } catch (error) {
      console.error("Error fetching analytics data:", error);
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to fetch analytics data", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [password]);

  // Filter data by date range
  const filteredLogs = useMemo(() => {
    const cutoff = subDays(new Date(), parseInt(dateRange));
    return emailLogs.filter(log => new Date(log.sent_at) >= cutoff);
  }, [emailLogs, dateRange]);

  const filteredEvents = useMemo(() => {
    const cutoff = subDays(new Date(), parseInt(dateRange));
    return trackingEvents.filter(event => new Date(event.created_at) >= cutoff);
  }, [trackingEvents, dateRange]);

  // Engagement trends over time
  const engagementTrends = useMemo(() => {
    const days: Record<string, { date: string; sent: number; opens: number; clicks: number; openRate: number; clickRate: number }> = {};
    const numDays = parseInt(dateRange);
    
    for (let i = numDays - 1; i >= 0; i--) {
      const date = format(subDays(new Date(), i), "yyyy-MM-dd");
      const displayDate = format(subDays(new Date(), i), "MMM d");
      days[date] = { date: displayDate, sent: 0, opens: 0, clicks: 0, openRate: 0, clickRate: 0 };
    }

    filteredLogs.forEach(log => {
      const date = format(new Date(log.sent_at), "yyyy-MM-dd");
      if (days[date]) days[date].sent++;
    });

    filteredEvents.forEach(event => {
      const date = format(new Date(event.created_at), "yyyy-MM-dd");
      if (days[date]) {
        if (event.event_type === "open") days[date].opens++;
        if (event.event_type === "click") days[date].clicks++;
      }
    });

    return Object.values(days).map(day => ({
      ...day,
      openRate: day.sent > 0 ? Math.round((day.opens / day.sent) * 100) : 0,
      clickRate: day.sent > 0 ? Math.round((day.clicks / day.sent) * 100) : 0,
    }));
  }, [filteredLogs, filteredEvents, dateRange]);

  // Recipient engagement scores
  const recipientInsights = useMemo(() => {
    const recipients: Record<string, { 
      email: string; 
      sent: number; 
      opens: number; 
      clicks: number; 
      lastEngagement: string | null;
      engagementScore: number;
    }> = {};

    filteredLogs.forEach(log => {
      if (!recipients[log.recipient_email]) {
        recipients[log.recipient_email] = { 
          email: log.recipient_email, 
          sent: 0, 
          opens: 0, 
          clicks: 0, 
          lastEngagement: null,
          engagementScore: 0,
        };
      }
      recipients[log.recipient_email].sent++;
    });

    filteredEvents.forEach(event => {
      const log = emailLogs.find(l => l.id === event.email_log_id);
      if (log && recipients[log.recipient_email]) {
        if (event.event_type === "open") recipients[log.recipient_email].opens++;
        if (event.event_type === "click") recipients[log.recipient_email].clicks++;
        
        const eventDate = event.created_at;
        if (!recipients[log.recipient_email].lastEngagement || 
            eventDate > recipients[log.recipient_email].lastEngagement!) {
          recipients[log.recipient_email].lastEngagement = eventDate;
        }
      }
    });

    // Calculate engagement score (weighted: clicks = 3, opens = 1)
    Object.values(recipients).forEach(r => {
      const openRate = r.sent > 0 ? r.opens / r.sent : 0;
      const clickRate = r.sent > 0 ? r.clicks / r.sent : 0;
      r.engagementScore = Math.round((openRate + clickRate * 3) * 100);
    });

    return Object.values(recipients)
      .filter(r => r.sent > 0)
      .sort((a, b) => b.engagementScore - a.engagementScore)
      .slice(0, 20);
  }, [filteredLogs, filteredEvents, emailLogs]);

  // Performance by day of week
  const dayOfWeekPerformance = useMemo(() => {
    const days: Record<number, { opens: number; clicks: number; sent: number }> = {};
    DAYS_OF_WEEK.forEach((_, i) => days[i] = { opens: 0, clicks: 0, sent: 0 });

    filteredLogs.forEach(log => {
      const day = getDay(new Date(log.sent_at));
      days[day].sent++;
    });

    filteredEvents.forEach(event => {
      const day = getDay(new Date(event.created_at));
      if (event.event_type === "open") days[day].opens++;
      if (event.event_type === "click") days[day].clicks++;
    });

    return DAYS_OF_WEEK.map((name, i) => ({
      day: name,
      opens: days[i].opens,
      clicks: days[i].clicks,
      sent: days[i].sent,
      openRate: days[i].sent > 0 ? Math.round((days[i].opens / days[i].sent) * 100) : 0,
    }));
  }, [filteredLogs, filteredEvents]);

  // Performance by hour of day
  const hourOfDayPerformance = useMemo(() => {
    const hours: Record<number, { opens: number; clicks: number; sent: number }> = {};
    HOURS_OF_DAY.forEach(h => hours[h] = { opens: 0, clicks: 0, sent: 0 });

    filteredLogs.forEach(log => {
      const hour = getHours(new Date(log.sent_at));
      hours[hour].sent++;
    });

    filteredEvents.forEach(event => {
      const hour = getHours(new Date(event.created_at));
      if (event.event_type === "open") hours[hour].opens++;
      if (event.event_type === "click") hours[hour].clicks++;
    });

    return HOURS_OF_DAY.map(h => ({
      hour: `${h}:00`,
      hourNum: h,
      opens: hours[h].opens,
      clicks: hours[h].clicks,
      sent: hours[h].sent,
      openRate: hours[h].sent > 0 ? Math.round((hours[h].opens / hours[h].sent) * 100) : 0,
    }));
  }, [filteredLogs, filteredEvents]);

  // Top clicked links
  const topLinks = useMemo(() => {
    const links: Record<string, { url: string; clicks: number }> = {};
    
    filteredEvents
      .filter(e => e.event_type === "click" && e.link_url)
      .forEach(event => {
        const url = event.link_url!;
        if (!links[url]) links[url] = { url, clicks: 0 };
        links[url].clicks++;
      });

    return Object.values(links)
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);
  }, [filteredEvents]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalSent = filteredLogs.length;
    const totalOpens = filteredEvents.filter(e => e.event_type === "open").length;
    const totalClicks = filteredEvents.filter(e => e.event_type === "click").length;
    const uniqueOpens = new Set(filteredEvents.filter(e => e.event_type === "open").map(e => e.email_log_id)).size;
    const uniqueClicks = new Set(filteredEvents.filter(e => e.event_type === "click").map(e => e.email_log_id)).size;
    
    // Compare to previous period
    const prevCutoff = subDays(new Date(), parseInt(dateRange) * 2);
    const currCutoff = subDays(new Date(), parseInt(dateRange));
    const prevLogs = emailLogs.filter(l => {
      const date = new Date(l.sent_at);
      return date >= prevCutoff && date < currCutoff;
    });
    const prevEvents = trackingEvents.filter(e => {
      const date = new Date(e.created_at);
      return date >= prevCutoff && date < currCutoff;
    });
    const prevOpens = new Set(prevEvents.filter(e => e.event_type === "open").map(e => e.email_log_id)).size;
    const prevClicks = new Set(prevEvents.filter(e => e.event_type === "click").map(e => e.email_log_id)).size;

    const openRateChange = prevLogs.length > 0 
      ? ((uniqueOpens / totalSent) - (prevOpens / prevLogs.length)) * 100 
      : 0;
    const clickRateChange = prevLogs.length > 0 
      ? ((uniqueClicks / totalSent) - (prevClicks / prevLogs.length)) * 100 
      : 0;

    return {
      totalSent,
      totalOpens,
      totalClicks,
      uniqueOpens,
      uniqueClicks,
      openRate: totalSent > 0 ? ((uniqueOpens / totalSent) * 100).toFixed(1) : "0",
      clickRate: totalSent > 0 ? ((uniqueClicks / totalSent) * 100).toFixed(1) : "0",
      openRateChange: openRateChange.toFixed(1),
      clickRateChange: clickRateChange.toFixed(1),
    };
  }, [filteredLogs, filteredEvents, emailLogs, trackingEvents, dateRange]);

  // Best performing time
  const bestTime = useMemo(() => {
    const best = hourOfDayPerformance.reduce((max, curr) => 
      curr.openRate > max.openRate ? curr : max
    , { hour: "10:00", openRate: 0, hourNum: 10 });
    return best;
  }, [hourOfDayPerformance]);

  // Best performing day
  const bestDay = useMemo(() => {
    const best = dayOfWeekPerformance.reduce((max, curr) => 
      curr.openRate > max.openRate ? curr : max
    , { day: "Tuesday", openRate: 0 });
    return best;
  }, [dayOfWeekPerformance]);

  const getEngagementBadge = (score: number) => {
    if (score >= 150) return <Badge className="bg-green-500/20 text-green-400">Highly Engaged</Badge>;
    if (score >= 75) return <Badge className="bg-blue-500/20 text-blue-400">Engaged</Badge>;
    if (score >= 25) return <Badge className="bg-yellow-500/20 text-yellow-400">Low Engagement</Badge>;
    return <Badge className="bg-red-500/20 text-red-400">Inactive</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Email Analytics</h2>
          <p className="text-sm text-muted-foreground">Engagement trends and recipient insights</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={dateRange} onValueChange={(v: "7" | "14" | "30" | "90") => setDateRange(v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{summaryStats.totalSent}</p>
                  <p className="text-sm text-muted-foreground">Emails Sent</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <Eye className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{summaryStats.openRate}%</p>
                  <p className="text-sm text-muted-foreground">Open Rate</p>
                </div>
              </div>
              <div className={`flex items-center text-xs ${parseFloat(summaryStats.openRateChange) >= 0 ? "text-green-400" : "text-red-400"}`}>
                {parseFloat(summaryStats.openRateChange) >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(parseFloat(summaryStats.openRateChange))}%
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <MousePointerClick className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{summaryStats.clickRate}%</p>
                  <p className="text-sm text-muted-foreground">Click Rate</p>
                </div>
              </div>
              <div className={`flex items-center text-xs ${parseFloat(summaryStats.clickRateChange) >= 0 ? "text-green-400" : "text-red-400"}`}>
                {parseFloat(summaryStats.clickRateChange) >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(parseFloat(summaryStats.clickRateChange))}%
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Users className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{recipientInsights.length}</p>
                <p className="text-sm text-muted-foreground">Active Recipients</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Best Times Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-primary/10 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-blue-400" />
              <div>
                <p className="text-sm text-muted-foreground">Best Time to Send</p>
                <p className="text-xl font-bold text-foreground">{bestTime.hour}</p>
                <p className="text-xs text-muted-foreground">{bestTime.openRate}% open rate at this hour</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-primary/10 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-sm text-muted-foreground">Best Day to Send</p>
                <p className="text-xl font-bold text-foreground">{bestDay.day}</p>
                <p className="text-xs text-muted-foreground">{bestDay.openRate}% open rate on this day</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Engagement Trends Chart */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Engagement Trends
          </CardTitle>
          <CardDescription>Opens and clicks over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            {engagementTrends.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={engagementTrends}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="sent" stroke="hsl(var(--primary))" strokeWidth={2} name="Sent" dot={false} />
                  <Line yAxisId="left" type="monotone" dataKey="opens" stroke="hsl(210, 100%, 60%)" strokeWidth={2} name="Opens" dot={false} />
                  <Line yAxisId="left" type="monotone" dataKey="clicks" stroke="hsl(142, 76%, 45%)" strokeWidth={2} name="Clicks" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                No engagement data yet
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Day of Week & Hour Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Performance by Day of Week</CardTitle>
            <CardDescription>Open rates by weekday</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dayOfWeekPerformance}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number, name: string) => [
                      name === "openRate" ? `${value}%` : value,
                      name === "openRate" ? "Open Rate" : name
                    ]}
                  />
                  <Bar dataKey="openRate" fill="hsl(210, 100%, 60%)" radius={[4, 4, 0, 0]} name="Open Rate %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Performance by Hour</CardTitle>
            <CardDescription>Open rates by time of day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourOfDayPerformance.filter((_, i) => i >= 6 && i <= 22)}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={1} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number, name: string) => [
                      name === "openRate" ? `${value}%` : value,
                      name === "openRate" ? "Open Rate" : name
                    ]}
                  />
                  <Bar dataKey="openRate" fill="hsl(142, 76%, 45%)" radius={[4, 4, 0, 0]} name="Open Rate %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recipient Insights & Top Links */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              Top Engaged Recipients
            </CardTitle>
            <CardDescription>Recipients ranked by engagement score</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-center">Opens</TableHead>
                    <TableHead className="text-center">Clicks</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipientInsights.length > 0 ? (
                    recipientInsights.map((recipient) => (
                      <TableRow key={recipient.email}>
                        <TableCell className="font-medium text-sm truncate max-w-[180px]" title={recipient.email}>
                          {recipient.email}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-blue-400">{recipient.opens}</span>
                          <span className="text-muted-foreground text-xs">/{recipient.sent}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-green-400">{recipient.clicks}</span>
                        </TableCell>
                        <TableCell>{getEngagementBadge(recipient.engagementScore)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No recipient data yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Top Clicked Links
            </CardTitle>
            <CardDescription>Most clicked URLs in your emails</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {topLinks.length > 0 ? (
                topLinks.map((link, index) => (
                  <div key={link.url} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-sm font-medium text-muted-foreground w-5">{index + 1}</span>
                      <span className="text-sm truncate flex-1" title={link.url}>
                        {link.url.length > 50 ? `${link.url.substring(0, 50)}...` : link.url}
                      </span>
                    </div>
                    <Badge variant="secondary" className="ml-2">
                      {link.clicks} clicks
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No link clicks yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
