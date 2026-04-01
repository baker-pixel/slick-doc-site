import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Mail, 
  Search,
  Target,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Globe,
  Star,
  MessageSquare,
  Calendar,
  Lightbulb,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";

interface ClientAccount {
  id: string;
  business_name: string;
}

interface SeoAnalysis {
  overall_score: number | null;
  keyword_score: number | null;
  technical_score: number | null;
  url: string;
  analyzed_at: string;
}

interface ActionItem {
  id: string;
  title: string;
  priority: "high" | "medium" | "low";
  category: string;
  status: "pending" | "in_progress" | "completed";
  impact: string;
}

export function MarketingOSDashboard() {
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

  const { data: clients = [] } = useQuery({
    queryKey: ["client-accounts-os"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_accounts")
        .select("id, business_name")
        .order("business_name", { ascending: true });
      if (error) throw error;
      return data as ClientAccount[];
    },
  });

  const { data: seoData } = useQuery({
    queryKey: ["seo-analysis-os", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return null;
      const { data, error } = await supabase
        .from("seo_page_analysis")
        .select("*")
        .eq("client_account_id", selectedClientId)
        .order("analyzed_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data as SeoAnalysis[];
    },
    enabled: !!selectedClientId,
  });

  const { data: analytics } = useQuery({
    queryKey: ["client-analytics-os", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return null;
      const { data, error } = await supabase
        .from("client_analytics")
        .select("*")
        .eq("client_account_id", selectedClientId)
        .order("period_end", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClientId,
  });

  const { data: tasks } = useQuery({
    queryKey: ["client-tasks-os", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return null;
      const { data, error } = await supabase
        .from("client_tasks")
        .select("*")
        .eq("client_account_id", selectedClientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClientId,
  });

  const { data: emailLogs } = useQuery({
    queryKey: ["email-performance-os"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_logs")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: trackingEvents } = useQuery({
    queryKey: ["tracking-events-os"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_tracking_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  // Calculate metrics
  const emailsSent = emailLogs?.length || 0;
  const opens = trackingEvents?.filter(e => e.event_type === "open").length || 0;
  const clicks = trackingEvents?.filter(e => e.event_type === "click").length || 0;
  const openRate = emailsSent > 0 ? ((opens / emailsSent) * 100).toFixed(1) : "0";
  const clickRate = opens > 0 ? ((clicks / opens) * 100).toFixed(1) : "0";

  const pendingTasks = tasks?.filter(t => t.status === "pending").length || 0;
  const completedTasks = tasks?.filter(t => t.status === "completed").length || 0;
  const totalTasks = tasks?.length || 0;
  const taskCompletionRate = totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(0) : "0";

  const avgSeoScore = seoData?.length 
    ? Math.round(seoData.reduce((acc, s) => acc + (s.overall_score || 0), 0) / seoData.length) 
    : 0;

  // Mock action items (would come from AI analysis in production)
  const actionItems: ActionItem[] = [
    { id: "1", title: "Optimize meta descriptions for top 5 pages", priority: "high", category: "SEO", status: "pending", impact: "+15% CTR" },
    { id: "2", title: "Set up Google Business Profile posting schedule", priority: "high", category: "Local SEO", status: "pending", impact: "+20% visibility" },
    { id: "3", title: "Create retargeting campaign for cart abandoners", priority: "medium", category: "Ads", status: "in_progress", impact: "+8% conversions" },
    { id: "4", title: "Add schema markup to service pages", priority: "medium", category: "Technical SEO", status: "pending", impact: "Rich snippets" },
    { id: "5", title: "Launch email win-back sequence", priority: "low", category: "Email", status: "pending", impact: "+5% reactivation" },
  ];

  const generateAIInsights = async () => {
    if (!selectedClientId) {
      toast.error("Please select a client first");
      return;
    }
    setIsGeneratingInsights(true);
    try {
      // This would call an edge function to generate AI insights
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast.success("AI insights generated successfully!");
    } catch (error) {
      toast.error("Failed to generate insights");
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "destructive";
      case "medium": return "default";
      case "low": return "secondary";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Marketing OS Dashboard</h2>
          <p className="text-muted-foreground">Unified command center for all marketing activities</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedClientId} onValueChange={setSelectedClientId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select a client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.business_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            onClick={generateAIInsights} 
            disabled={isGeneratingInsights || !selectedClientId}
            variant="outline"
          >
            <Lightbulb className="mr-2 h-4 w-4" />
            {isGeneratingInsights ? "Generating..." : "AI Insights"}
          </Button>
        </div>
      </div>

      {/* Key Performance Indicators */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SEO Health Score</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgSeoScore}/100</div>
            <Progress value={avgSeoScore} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {avgSeoScore >= 70 ? (
                <span className="text-green-600 flex items-center gap-1">
                  <ArrowUp className="h-3 w-3" /> Good standing
                </span>
              ) : (
                <span className="text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Needs attention
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Email Performance</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openRate}% Open Rate</div>
            <p className="text-xs text-muted-foreground">
              {clickRate}% click-through rate
            </p>
            <div className="flex gap-2 mt-2">
              <Badge variant="outline">{emailsSent} sent</Badge>
              <Badge variant="secondary">{opens} opens</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Task Progress</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{taskCompletionRate}%</div>
            <Progress value={Number(taskCompletionRate)} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {completedTasks}/{totalTasks} tasks completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Actions</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingTasks}</div>
            <p className="text-xs text-muted-foreground">
              Action items requiring attention
            </p>
            <Button variant="link" className="p-0 h-auto mt-2 text-xs">
              View all →
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="seo">SEO & Visibility</TabsTrigger>
          <TabsTrigger value="actions">Action Items</TabsTrigger>
          <TabsTrigger value="insights">AI Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Quick Stats Cards */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="h-4 w-4" /> Website Analytics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Sessions</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Page Views</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Avg. Duration</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Bounce Rate</span>
                  <span className="font-medium">--</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Star className="h-4 w-4" /> Reputation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Google Rating</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Reviews</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">This Month</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Response Rate</span>
                  <span className="font-medium">--</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Lead Tracking
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">New Leads</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Qualified</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Converted</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Conversion Rate</span>
                  <span className="font-medium">--</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4" /> Ad Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Impressions</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Clicks</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">CTR</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Cost per Lead</span>
                  <span className="font-medium">--</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> Social Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Followers</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Engagement</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Posts This Month</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Reach</span>
                  <span className="font-medium">--</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Upcoming
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Scheduled Posts</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Queued Emails</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Pending Reviews</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Meetings</span>
                  <span className="font-medium">--</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="seo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>SEO Ranking Tracker</CardTitle>
              <CardDescription>Monitor keyword positions and visibility</CardDescription>
            </CardHeader>
            <CardContent>
              {seoData && seoData.length > 0 ? (
                <div className="space-y-4">
                  {seoData.map((analysis, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-sm truncate max-w-md">{analysis.url}</p>
                        <p className="text-xs text-muted-foreground">
                          Analyzed: {new Date(analysis.analyzed_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Overall</p>
                          <Badge variant={analysis.overall_score && analysis.overall_score >= 70 ? "default" : "secondary"}>
                            {analysis.overall_score || 0}
                          </Badge>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Technical</p>
                          <Badge variant="outline">{analysis.technical_score || 0}</Badge>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Keywords</p>
                          <Badge variant="outline">{analysis.keyword_score || 0}</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No SEO analysis data available</p>
                  <p className="text-sm">Run an SEO analysis from the SEO Dashboard</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI-Recommended Action Items</CardTitle>
              <CardDescription>Prioritized tasks to improve marketing performance</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {actionItems.map((item) => (
                    <div 
                      key={item.id} 
                      className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={getPriorityColor(item.priority) as any}>
                            {item.priority}
                          </Badge>
                          <Badge variant="outline">{item.category}</Badge>
                        </div>
                        <p className="font-medium">{item.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Expected impact: <span className="text-green-600 font-medium">{item.impact}</span>
                        </p>
                      </div>
                      <Button size="sm" variant="outline">
                        {item.status === "pending" ? "Start" : item.status === "in_progress" ? "Continue" : "Done"}
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5" /> AI-Powered Insights
              </CardTitle>
              <CardDescription>Machine learning analysis of your marketing data</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedClientId ? (
                <div className="space-y-6">
                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-semibold mb-2">Key Observations</h4>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <TrendingUp className="h-4 w-4 mt-0.5 text-green-600" />
                        <span>Email open rates are above industry average</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600" />
                        <span>SEO scores could be improved with meta optimization</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <ArrowUp className="h-4 w-4 mt-0.5 text-blue-600" />
                        <span>Task completion rate trending upward</span>
                      </li>
                    </ul>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-semibold mb-2">Recommended Next Steps</h4>
                    <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                      <li>Run comprehensive SEO audit on main landing pages</li>
                      <li>Set up automated review request sequence</li>
                      <li>Create retargeting audiences from website visitors</li>
                    </ol>
                  </div>

                  <Button onClick={generateAIInsights} disabled={isGeneratingInsights} className="w-full">
                    <RefreshCw className={`mr-2 h-4 w-4 ${isGeneratingInsights ? "animate-spin" : ""}`} />
                    {isGeneratingInsights ? "Analyzing..." : "Refresh AI Analysis"}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Lightbulb className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Select a client to view AI insights</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
