import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Eye, MousePointerClick, AlertCircle, TrendingUp, Users } from "lucide-react";

interface SequenceAnalytics {
  sequenceId: string;
  sequenceName: string;
  triggerType: string;
  totalSent: number;
  totalOpens: number;
  uniqueOpens: number;
  totalClicks: number;
  uniqueClicks: number;
  bounces: number;
  complaints: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
}

interface EmailSequenceAnalyticsProps {
  sequenceId?: string;
  sequenceName?: string;
}

export function EmailSequenceAnalytics({ sequenceId, sequenceName }: EmailSequenceAnalyticsProps) {
  const [analytics, setAnalytics] = useState<SequenceAnalytics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [overallStats, setOverallStats] = useState({
    totalSent: 0,
    avgOpenRate: 0,
    avgClickRate: 0,
    totalBounces: 0,
  });

  useEffect(() => {
    fetchAnalytics();
  }, [sequenceId]);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    
    // Fetch all sequences first
    const { data: sequences } = await supabase
      .from("email_sequences")
      .select("id, name, trigger_type");

    if (!sequences) {
      setIsLoading(false);
      return;
    }

    // Fetch email logs with their tracking events
    const { data: emailLogs } = await supabase
      .from("email_logs")
      .select(`
        id,
        recipient_email,
        subject,
        status,
        metadata,
        sent_at
      `)
      .order("sent_at", { ascending: false });

    // Fetch tracking events
    const { data: trackingEvents } = await supabase
      .from("email_tracking_events")
      .select("*");

    if (!emailLogs || !trackingEvents) {
      setIsLoading(false);
      return;
    }

    // Group events by email_log_id
    const eventsByEmail = trackingEvents.reduce((acc, event) => {
      if (!event.email_log_id) return acc;
      if (!acc[event.email_log_id]) acc[event.email_log_id] = [];
      acc[event.email_log_id].push(event);
      return acc;
    }, {} as Record<string, typeof trackingEvents>);

    // Calculate analytics per sequence
    const sequenceAnalytics: SequenceAnalytics[] = sequences.map(seq => {
      // Filter emails that belong to this sequence based on metadata
      const sequenceEmails = emailLogs.filter(log => {
        const metadata = log.metadata as Record<string, unknown> | null;
        return metadata?.sequence_id === seq.id || 
               metadata?.trigger_type === seq.trigger_type;
      });

      const totalSent = sequenceEmails.length;
      let totalOpens = 0;
      let uniqueOpens = 0;
      let totalClicks = 0;
      let uniqueClicks = 0;
      let bounces = 0;
      let complaints = 0;
      const openedEmails = new Set<string>();
      const clickedEmails = new Set<string>();

      sequenceEmails.forEach(email => {
        const events = eventsByEmail[email.id] || [];
        
        events.forEach(event => {
          switch (event.event_type) {
            case "open":
              totalOpens++;
              openedEmails.add(email.id);
              break;
            case "click":
              totalClicks++;
              clickedEmails.add(email.id);
              break;
            case "bounce":
              bounces++;
              break;
            case "complaint":
              complaints++;
              break;
          }
        });
      });

      uniqueOpens = openedEmails.size;
      uniqueClicks = clickedEmails.size;

      const openRate = totalSent > 0 ? (uniqueOpens / totalSent) * 100 : 0;
      const clickRate = totalSent > 0 ? (uniqueClicks / totalSent) * 100 : 0;
      const clickToOpenRate = uniqueOpens > 0 ? (uniqueClicks / uniqueOpens) * 100 : 0;

      return {
        sequenceId: seq.id,
        sequenceName: seq.name,
        triggerType: seq.trigger_type,
        totalSent,
        totalOpens,
        uniqueOpens,
        totalClicks,
        uniqueClicks,
        bounces,
        complaints,
        openRate,
        clickRate,
        clickToOpenRate,
      };
    });

    // Filter by specific sequence if provided
    const filteredAnalytics = sequenceId 
      ? sequenceAnalytics.filter(a => a.sequenceId === sequenceId)
      : sequenceAnalytics;

    // Calculate overall stats
    const totalSent = filteredAnalytics.reduce((sum, a) => sum + a.totalSent, 0);
    const totalOpens = filteredAnalytics.reduce((sum, a) => sum + a.uniqueOpens, 0);
    const totalClicks = filteredAnalytics.reduce((sum, a) => sum + a.uniqueClicks, 0);
    const totalBounces = filteredAnalytics.reduce((sum, a) => sum + a.bounces, 0);

    setOverallStats({
      totalSent,
      avgOpenRate: totalSent > 0 ? (totalOpens / totalSent) * 100 : 0,
      avgClickRate: totalSent > 0 ? (totalClicks / totalSent) * 100 : 0,
      totalBounces,
    });

    setAnalytics(filteredAnalytics.sort((a, b) => b.totalSent - a.totalSent));
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-24 bg-muted/30" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Mail className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Sent</p>
                <p className="text-2xl font-bold">{overallStats.totalSent.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Eye className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Open Rate</p>
                <p className="text-2xl font-bold">{overallStats.avgOpenRate.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <MousePointerClick className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Click Rate</p>
                <p className="text-2xl font-bold">{overallStats.avgClickRate.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <AlertCircle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Bounces</p>
                <p className="text-2xl font-bold">{overallStats.totalBounces}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-Sequence Analytics */}
      {!sequenceId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Performance by Sequence
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No email data available yet</p>
            ) : (
              <div className="space-y-6">
                {analytics.map(seq => (
                  <div key={seq.sequenceId} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{seq.sequenceName}</p>
                        <p className="text-sm text-muted-foreground">
                          {seq.totalSent} sent • {seq.uniqueOpens} opens • {seq.uniqueClicks} clicks
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <span className="text-green-500">{seq.openRate.toFixed(1)}% open</span>
                        {" • "}
                        <span className="text-blue-500">{seq.clickRate.toFixed(1)}% click</span>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-16">Opens</span>
                        <Progress value={seq.openRate} className="h-2 flex-1" />
                        <span className="text-xs font-medium w-12 text-right">{seq.openRate.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-16">Clicks</span>
                        <Progress value={seq.clickRate} className="h-2 flex-1" />
                        <span className="text-xs font-medium w-12 text-right">{seq.clickRate.toFixed(0)}%</span>
                      </div>
                    </div>

                    {(seq.bounces > 0 || seq.complaints > 0) && (
                      <div className="flex gap-4 text-xs">
                        {seq.bounces > 0 && (
                          <span className="text-amber-500">{seq.bounces} bounces</span>
                        )}
                        {seq.complaints > 0 && (
                          <span className="text-red-500">{seq.complaints} complaints</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Single Sequence Detail */}
      {sequenceId && analytics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{sequenceName || "Sequence"} Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Open Rate</span>
                  <span className="font-medium text-green-500">{analytics[0].openRate.toFixed(1)}%</span>
                </div>
                <Progress value={analytics[0].openRate} className="h-3" />
                <p className="text-xs text-muted-foreground">
                  {analytics[0].uniqueOpens} of {analytics[0].totalSent} emails opened
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Click Rate</span>
                  <span className="font-medium text-blue-500">{analytics[0].clickRate.toFixed(1)}%</span>
                </div>
                <Progress value={analytics[0].clickRate} className="h-3" />
                <p className="text-xs text-muted-foreground">
                  {analytics[0].uniqueClicks} of {analytics[0].totalSent} emails clicked
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Click-to-Open Rate</span>
                  <span className="font-medium text-purple-500">{analytics[0].clickToOpenRate.toFixed(1)}%</span>
                </div>
                <Progress value={analytics[0].clickToOpenRate} className="h-3" />
                <p className="text-xs text-muted-foreground">
                  {analytics[0].uniqueClicks} clicks from {analytics[0].uniqueOpens} opens
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
