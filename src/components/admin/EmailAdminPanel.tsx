import { useState, useEffect, useMemo } from "react";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, Search, Mail, Clock, CheckCircle, XCircle, Eye, Trash2, Send, TrendingUp, BarChart3 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar } from "recharts";
import type { Json } from "@/integrations/supabase/types";

interface EmailQueueItem {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  html_content: string;
  status: string;
  scheduled_for: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  metadata: Json;
}

interface EmailLog {
  id: string;
  recipient_email: string;
  subject: string;
  status: string;
  sent_at: string;
  resend_id: string | null;
  metadata: Json;
  tracking_id?: string;
}

interface TrackingEvent {
  id: string;
  email_log_id: string;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  link_url: string | null;
  created_at: string;
  metadata: Json;
}

interface TrackingStats {
  totalSent: number;
  uniqueOpens: number;
  uniqueClicks: number;
  bounces: number;
  delivered: number;
  openRate: string;
  clickRate: string;
  bounceRate: string;
  deliveryRate: string;
}

interface EmailSequence {
  id: string;
  name: string;
  trigger_type: string;
  is_active: boolean;
  emails: Json;
  created_at: string;
  updated_at: string;
}

interface EmailAdminPanelProps {
  password: string;
}

export const EmailAdminPanel = ({ password }: EmailAdminPanelProps) => {
  const [emailQueue, setEmailQueue] = useState<EmailQueueItem[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [sequences, setSequences] = useState<EmailSequence[]>([]);
  const [trackingEvents, setTrackingEvents] = useState<TrackingEvent[]>([]);
  const [trackingStats, setTrackingStats] = useState<TrackingStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [queueSearch, setQueueSearch] = useState("");
  const [queueStatusFilter, setQueueStatusFilter] = useState("all");
  const [logSearch, setLogSearch] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<EmailQueueItem | EmailLog | null>(null);
  const [selectedSequence, setSelectedSequence] = useState<EmailSequence | null>(null);
  const [isSequenceDialogOpen, setIsSequenceDialogOpen] = useState(false);

  const fetchEmailData = async () => {
    setIsLoading(true);
    try {
      const response = await supabase.functions.invoke("admin", {
        body: { action: "list", table: "email_queue", password },
      });
      if (response.data?.data) {
        setEmailQueue(response.data.data);
      }

      const logsResponse = await supabase.functions.invoke("admin", {
        body: { action: "list", table: "email_logs", password },
      });
      if (logsResponse.data?.data) {
        setEmailLogs(logsResponse.data.data);
      }

      const seqResponse = await supabase.functions.invoke("admin", {
        body: { action: "list", table: "email_sequences", password },
      });
      if (seqResponse.data?.data) {
        setSequences(seqResponse.data.data);
      }

      // Fetch tracking events
      const trackingResponse = await supabase.functions.invoke("admin", {
        body: { action: "list_tracking_events", password },
      });
      if (trackingResponse.data?.data) {
        setTrackingEvents(trackingResponse.data.data);
      }

      // Fetch tracking stats
      const statsResponse = await supabase.functions.invoke("admin", {
        body: { action: "get_tracking_stats", password },
      });
      if (statsResponse.data?.data) {
        setTrackingStats(statsResponse.data.data);
      }
    } catch (error) {
      console.error("Error fetching email data:", error);
      toast({
        title: "Error",
        description: "Failed to fetch email data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEmailData();
  }, [password]);

  const filteredQueue = useMemo(() => {
    return emailQueue.filter((item) => {
      const matchesSearch =
        queueSearch === "" ||
        item.recipient_email.toLowerCase().includes(queueSearch.toLowerCase()) ||
        item.subject.toLowerCase().includes(queueSearch.toLowerCase());
      const matchesStatus = queueStatusFilter === "all" || item.status === queueStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [emailQueue, queueSearch, queueStatusFilter]);

  const filteredLogs = useMemo(() => {
    return emailLogs.filter((item) => {
      return (
        logSearch === "" ||
        item.recipient_email.toLowerCase().includes(logSearch.toLowerCase()) ||
        item.subject.toLowerCase().includes(logSearch.toLowerCase())
      );
    });
  }, [emailLogs, logSearch]);

  const handleToggleSequence = async (sequence: EmailSequence) => {
    try {
      await supabase.functions.invoke("admin", {
        body: {
          action: "update",
          table: "email_sequences",
          id: sequence.id,
          data: { is_active: !sequence.is_active },
          password,
        },
      });
      toast({
        title: "Success",
        description: `Sequence ${sequence.is_active ? "disabled" : "enabled"}`,
      });
      fetchEmailData();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update sequence",
        variant: "destructive",
      });
    }
  };

  const handleDeleteQueueItem = async (id: string) => {
    try {
      await supabase.functions.invoke("admin", {
        body: { action: "delete", table: "email_queue", id, password },
      });
      toast({ title: "Success", description: "Email removed from queue" });
      fetchEmailData();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete email",
        variant: "destructive",
      });
    }
  };

  const handleProcessQueue = async () => {
    try {
      setIsLoading(true);
      await supabase.functions.invoke("process-email-queue");
      toast({ title: "Success", description: "Email queue processed" });
      fetchEmailData();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process queue",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Sent</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pending</Badge>;
      case "failed":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Failed</Badge>;
      case "scheduled":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Scheduled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const queueStats = useMemo(() => {
    const pending = emailQueue.filter((e) => e.status === "pending").length;
    const scheduled = emailQueue.filter((e) => e.status === "scheduled").length;
    const failed = emailQueue.filter((e) => e.status === "failed").length;
    const sent = emailLogs.length;
    return { pending, scheduled, failed, sent };
  }, [emailQueue, emailLogs]);

  // Email volume over last 14 days
  const volumeData = useMemo(() => {
    const days: { date: string; sent: number; queued: number; failed: number }[] = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const date = subDays(today, i);
      const dateStr = format(date, "yyyy-MM-dd");
      days.push({ date: format(date, "MMM d"), sent: 0, queued: 0, failed: 0 });
    }

    emailLogs.forEach((log) => {
      const logDate = format(new Date(log.sent_at), "MMM d");
      const entry = days.find((d) => d.date === logDate);
      if (entry) {
        if (log.status === "sent") entry.sent++;
        else entry.failed++;
      }
    });

    emailQueue.forEach((item) => {
      const itemDate = format(new Date(item.created_at), "MMM d");
      const entry = days.find((d) => d.date === itemDate);
      if (entry) {
        if (item.status === "failed") entry.failed++;
        else entry.queued++;
      }
    });

    return days;
  }, [emailLogs, emailQueue]);

  // Delivery status distribution
  const deliveryStatusData = useMemo(() => {
    const sent = emailLogs.filter((l) => l.status === "sent").length;
    const failed = emailLogs.filter((l) => l.status === "failed").length + emailQueue.filter((q) => q.status === "failed").length;
    const pending = emailQueue.filter((q) => q.status === "pending" || q.status === "scheduled").length;
    return [
      { name: "Delivered", value: sent, color: "hsl(142, 76%, 36%)" },
      { name: "Failed", value: failed, color: "hsl(0, 84%, 60%)" },
      { name: "Pending", value: pending, color: "hsl(45, 93%, 47%)" },
    ].filter((d) => d.value > 0);
  }, [emailLogs, emailQueue]);

  // Real engagement metrics from tracking
  const engagementData = useMemo(() => {
    if (trackingStats) {
      return {
        totalSent: trackingStats.totalSent,
        openRate: trackingStats.openRate,
        clickRate: trackingStats.clickRate,
        bounceRate: trackingStats.bounceRate,
        delivered: trackingStats.deliveryRate,
        uniqueOpens: trackingStats.uniqueOpens,
        uniqueClicks: trackingStats.uniqueClicks,
        isReal: true,
      };
    }
    
    // Fallback to basic stats if no tracking data
    const totalSent = emailLogs.filter((l) => l.status === "sent").length;
    return {
      totalSent,
      openRate: "0",
      clickRate: "0",
      bounceRate: "0",
      delivered: totalSent > 0 ? "100" : "0",
      uniqueOpens: 0,
      uniqueClicks: 0,
      isReal: false,
    };
  }, [emailLogs, trackingStats]);

  // Recent tracking activity
  const recentActivity = useMemo(() => {
    return trackingEvents.slice(0, 20).map(event => ({
      ...event,
      emailSubject: emailLogs.find(log => log.id === event.email_log_id)?.subject || "Unknown",
      emailRecipient: emailLogs.find(log => log.id === event.email_log_id)?.recipient_email || "Unknown",
    }));
  }, [trackingEvents, emailLogs]);

  // Email by sequence/trigger type
  const emailsByTrigger = useMemo(() => {
    const triggers: Record<string, number> = {};
    emailLogs.forEach((log) => {
      const meta = log.metadata as { triggerType?: string } | null;
      const trigger = meta?.triggerType || "manual";
      triggers[trigger] = (triggers[trigger] || 0) + 1;
    });
    emailQueue.forEach((item) => {
      const meta = item.metadata as { triggerType?: string } | null;
      const trigger = meta?.triggerType || "manual";
      triggers[trigger] = (triggers[trigger] || 0) + 1;
    });
    return Object.entries(triggers).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [emailLogs, emailQueue]);

  const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/20">
                <Clock className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{queueStats.pending}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Mail className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{queueStats.scheduled}</p>
                <p className="text-sm text-muted-foreground">Scheduled</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{queueStats.sent}</p>
                <p className="text-sm text-muted-foreground">Sent</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <XCircle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{queueStats.failed}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="analytics" className="w-full">
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="analytics" className="gap-1">
            <BarChart3 className="w-4 h-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="queue">Email Queue</TabsTrigger>
          <TabsTrigger value="sent">Sent Emails</TabsTrigger>
          <TabsTrigger value="sequences">Sequences</TabsTrigger>
        </TabsList>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          {/* Engagement Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <TrendingUp className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{engagementData.delivered}%</p>
                    <p className="text-sm text-muted-foreground">Delivery Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <Eye className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{engagementData.openRate}%</p>
                    <p className="text-sm text-muted-foreground">Open Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/20">
                    <Send className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{engagementData.clickRate}%</p>
                    <p className="text-sm text-muted-foreground">Click Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-500/20">
                    <XCircle className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{engagementData.bounceRate}%</p>
                    <p className="text-sm text-muted-foreground">Bounce Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          {!engagementData.isReal && (
            <p className="text-xs text-muted-foreground">*No tracking data yet - metrics will appear once emails are opened/clicked</p>
          )}
          {engagementData.isReal && (
            <p className="text-xs text-muted-foreground">
              {engagementData.uniqueOpens} unique opens, {engagementData.uniqueClicks} unique clicks from {engagementData.totalSent} sent emails
            </p>
          )}

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Email Volume Chart */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Email Volume (Last 14 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={volumeData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                      <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="sent"
                        stackId="1"
                        stroke="hsl(142, 76%, 36%)"
                        fill="hsl(142, 76%, 36%)"
                        fillOpacity={0.6}
                        name="Sent"
                      />
                      <Area
                        type="monotone"
                        dataKey="queued"
                        stackId="1"
                        stroke="hsl(45, 93%, 47%)"
                        fill="hsl(45, 93%, 47%)"
                        fillOpacity={0.6}
                        name="Queued"
                      />
                      <Area
                        type="monotone"
                        dataKey="failed"
                        stackId="1"
                        stroke="hsl(0, 84%, 60%)"
                        fill="hsl(0, 84%, 60%)"
                        fillOpacity={0.6}
                        name="Failed"
                      />
                      <Legend />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Delivery Status Pie Chart */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Delivery Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  {deliveryStatusData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={deliveryStatusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          dataKey="value"
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        >
                          {deliveryStatusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      No email data yet
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Emails by Trigger Type */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Emails by Trigger Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                {emailsByTrigger.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={emailsByTrigger} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Emails" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    No email data yet
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Tracking Activity */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent Tracking Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length > 0 ? (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {recentActivity.map((event) => (
                    <div key={event.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                      <div className={`p-1.5 rounded-md ${
                        event.event_type === "open" ? "bg-blue-500/20" :
                        event.event_type === "click" ? "bg-green-500/20" :
                        event.event_type === "delivered" ? "bg-primary/20" :
                        event.event_type === "bounced" ? "bg-red-500/20" : "bg-muted"
                      }`}>
                        {event.event_type === "open" && <Eye className="w-3.5 h-3.5 text-blue-400" />}
                        {event.event_type === "click" && <Send className="w-3.5 h-3.5 text-green-400" />}
                        {event.event_type === "delivered" && <CheckCircle className="w-3.5 h-3.5 text-primary" />}
                        {event.event_type === "bounced" && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                        {!["open", "click", "delivered", "bounced"].includes(event.event_type) && <Mail className="w-3.5 h-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{event.emailRecipient}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {event.event_type === "click" && event.link_url ? `Clicked: ${event.link_url}` : event.emailSubject}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="text-xs capitalize">{event.event_type}</Badge>
                        <p className="text-xs text-muted-foreground mt-1">{format(new Date(event.created_at), "MMM d, h:mm a")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                  No tracking events yet. Events will appear as emails are opened and links are clicked.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Queue Tab */}
        <TabsContent value="queue" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-4">
              <div className="flex flex-col md:flex-row gap-4 justify-between">
                <div className="flex gap-2 flex-1">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search emails..."
                      value={queueSearch}
                      onChange={(e) => setQueueSearch(e.target.value)}
                      className="pl-9 bg-background/50"
                    />
                  </div>
                  <Select value={queueStatusFilter} onValueChange={setQueueStatusFilter}>
                    <SelectTrigger className="w-32 bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={fetchEmailData} disabled={isLoading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                  <Button size="sm" onClick={handleProcessQueue} disabled={isLoading}>
                    <Send className="w-4 h-4 mr-2" />
                    Process Queue
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQueue.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No emails in queue
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredQueue.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-foreground">{item.recipient_name || "—"}</p>
                              <p className="text-sm text-muted-foreground">{item.recipient_email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{item.subject}</TableCell>
                          <TableCell>{getStatusBadge(item.status)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(item.scheduled_for), "MMM d, h:mm a")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setSelectedEmail(item)}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                  <DialogHeader>
                                    <DialogTitle>Email Preview</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div>
                                      <p className="text-sm text-muted-foreground">To</p>
                                      <p className="font-medium">{item.recipient_email}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground">Subject</p>
                                      <p className="font-medium">{item.subject}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground mb-2">Content</p>
                                      <div
                                        className="border rounded-lg p-4 bg-background"
                                        dangerouslySetInnerHTML={{ __html: item.html_content }}
                                      />
                                    </div>
                                    {item.error_message && (
                                      <div>
                                        <p className="text-sm text-red-400">Error</p>
                                        <p className="text-red-300">{item.error_message}</p>
                                      </div>
                                    )}
                                  </div>
                                </DialogContent>
                              </Dialog>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteQueueItem(item.id)}
                              >
                                <Trash2 className="w-4 h-4 text-red-400" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sent Emails Tab */}
        <TabsContent value="sent" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-4">
              <div className="flex gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search sent emails..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="pl-9 bg-background/50"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={fetchEmailData} disabled={isLoading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead>Resend ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No sent emails
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLogs.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.recipient_email}</TableCell>
                          <TableCell className="max-w-xs truncate">{item.subject}</TableCell>
                          <TableCell>{getStatusBadge(item.status)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(item.sent_at), "MMM d, h:mm a")}
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">
                            {item.resend_id || "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sequences Tab */}
        <TabsContent value="sequences" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Email Sequences</CardTitle>
                <Button variant="outline" size="sm" onClick={fetchEmailData} disabled={isLoading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {sequences.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No sequences configured</p>
                ) : (
                  sequences.map((sequence) => {
                    const emails = Array.isArray(sequence.emails) ? sequence.emails : [];
                    return (
                      <Card key={sequence.id} className="bg-background/50 border-border/30">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-foreground">{sequence.name}</h3>
                                <Badge variant="outline" className="text-xs">
                                  {sequence.trigger_type}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {emails.length} email{emails.length !== 1 ? "s" : ""} in sequence
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">
                                  {sequence.is_active ? "Active" : "Inactive"}
                                </span>
                                <Switch
                                  checked={sequence.is_active}
                                  onCheckedChange={() => handleToggleSequence(sequence)}
                                />
                              </div>
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setSelectedSequence(sequence)}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                  <DialogHeader>
                                    <DialogTitle>{sequence.name}</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div>
                                      <p className="text-sm text-muted-foreground">Trigger</p>
                                      <Badge variant="outline">{sequence.trigger_type}</Badge>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground mb-2">Emails in Sequence</p>
                                      <div className="space-y-3">
                                        {emails.map((email: any, index: number) => (
                                          <Card key={index} className="bg-muted/30">
                                            <CardContent className="p-3">
                                              <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs text-muted-foreground">
                                                  Email {index + 1}
                                                </span>
                                                <Badge variant="secondary" className="text-xs">
                                                  +{email.delay_hours || 0}h delay
                                                </Badge>
                                              </div>
                                              <p className="font-medium text-sm">{email.subject}</p>
                                            </CardContent>
                                          </Card>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
