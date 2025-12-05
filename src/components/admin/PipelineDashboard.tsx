import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, Mail, MousePointerClick, Calendar, TrendingUp } from "lucide-react";

interface PipelineStage {
  id: string;
  name: string;
  description: string;
  stage_order: number;
  color: string;
  count: number;
}

interface PipelineMetrics {
  totalLeads: number;
  emailsSent: number;
  emailsOpened: number;
  emailsClicked: number;
  pendingEmails: number;
  scheduledContent: number;
}

export default function PipelineDashboard() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [metrics, setMetrics] = useState<PipelineMetrics>({
    totalLeads: 0,
    emailsSent: 0,
    emailsOpened: 0,
    emailsClicked: 0,
    pendingEmails: 0,
    scheduledContent: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchPipelineData();
  }, []);

  const fetchPipelineData = async () => {
    try {
      // Fetch pipeline stages
      const { data: stagesData } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("is_active", true)
        .order("stage_order");

      // Fetch contact counts per stage
      const { data: contacts } = await supabase
        .from("contact_submissions")
        .select("pipeline_stage_id");

      // Count contacts per stage
      const stageCounts: Record<string, number> = {};
      contacts?.forEach((c) => {
        const stageId = c.pipeline_stage_id || "unassigned";
        stageCounts[stageId] = (stageCounts[stageId] || 0) + 1;
      });

      const stagesWithCounts = (stagesData || []).map((stage) => ({
        ...stage,
        count: stageCounts[stage.id] || 0,
      }));

      setStages(stagesWithCounts);

      // Fetch metrics
      const [emailLogs, trackingEvents, emailQueue, contentCalendar, gapAnalysis, pdfLeads] =
        await Promise.all([
          supabase.from("email_logs").select("id", { count: "exact" }),
          supabase.from("email_tracking_events").select("event_type"),
          supabase.from("email_queue").select("id", { count: "exact" }).eq("status", "pending"),
          supabase.from("content_calendar").select("id", { count: "exact" }).eq("status", "scheduled"),
          supabase.from("gap_analysis_submissions").select("id", { count: "exact" }),
          supabase.from("pdf_leads").select("id", { count: "exact" }),
        ]);

      const opens = trackingEvents.data?.filter((e) => e.event_type === "open").length || 0;
      const clicks = trackingEvents.data?.filter((e) => e.event_type === "click").length || 0;

      setMetrics({
        totalLeads:
          (contacts?.length || 0) +
          (gapAnalysis.count || 0) +
          (pdfLeads.count || 0),
        emailsSent: emailLogs.count || 0,
        emailsOpened: opens,
        emailsClicked: clicks,
        pendingEmails: emailQueue.count || 0,
        scheduledContent: contentCalendar.count || 0,
      });
    } catch (error) {
      console.error("Error fetching pipeline data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const openRate = metrics.emailsSent > 0 ? ((metrics.emailsOpened / metrics.emailsSent) * 100).toFixed(1) : "0";
  const clickRate = metrics.emailsOpened > 0 ? ((metrics.emailsClicked / metrics.emailsOpened) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {/* Funnel Visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Lead Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between gap-2">
            {stages.map((stage, index) => {
              const maxCount = Math.max(...stages.map((s) => s.count), 1);
              const height = Math.max((stage.count / maxCount) * 150, 40);
              const width = 100 - index * 10;

              return (
                <div
                  key={stage.id}
                  className="flex flex-col items-center flex-1"
                >
                  <div
                    className="w-full rounded-t-lg flex items-center justify-center transition-all hover:opacity-80 cursor-default"
                    style={{
                      backgroundColor: stage.color,
                      height: `${height}px`,
                      width: `${width}%`,
                      marginLeft: "auto",
                      marginRight: "auto",
                    }}
                  >
                    <span className="text-white font-bold text-lg">
                      {stage.count}
                    </span>
                  </div>
                  <div className="mt-2 text-center">
                    <p className="font-medium text-sm">{stage.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {stage.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Leads</span>
            </div>
            <p className="text-2xl font-bold mt-1">{metrics.totalLeads}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Emails Sent</span>
            </div>
            <p className="text-2xl font-bold mt-1">{metrics.emailsSent}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Open Rate</span>
            </div>
            <p className="text-2xl font-bold mt-1">{openRate}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <MousePointerClick className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Click Rate</span>
            </div>
            <p className="text-2xl font-bold mt-1">{clickRate}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Pending</span>
            </div>
            <p className="text-2xl font-bold mt-1">{metrics.pendingEmails}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">Scheduled</span>
            </div>
            <p className="text-2xl font-bold mt-1">{metrics.scheduledContent}</p>
          </CardContent>
        </Card>
      </div>

      {/* Automation Status */}
      <Card>
        <CardHeader>
          <CardTitle>Automation Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Email Queue Processing</p>
                <p className="text-sm text-muted-foreground">Runs every minute</p>
              </div>
              <Badge variant="default" className="bg-green-500">Active</Badge>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Content Publisher</p>
                <p className="text-sm text-muted-foreground">Runs every minute</p>
              </div>
              <Badge variant="default" className="bg-green-500">Active</Badge>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Form → Sequence Triggers</p>
                <p className="text-sm text-muted-foreground">Auto-enrolls new leads</p>
              </div>
              <Badge variant="default" className="bg-green-500">Active</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
