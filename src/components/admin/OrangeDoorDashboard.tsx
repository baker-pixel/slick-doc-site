import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { 
  Users, DollarSign, Bot, AlertTriangle, 
  Plus, RefreshCw, Flag, ChevronRight,
  Activity, Zap, Calendar, CalendarDays, CalendarRange,
  Sparkles, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, differenceInDays } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface ClientHealth {
  id: string;
  business_name: string;
  tier: string;
  last_ai_task: Date | null;
  status: string;
  health: 'green' | 'yellow' | 'red';
  mrr: number;
}

interface AIActivity {
  id: string;
  title: string;
  description: string;
  client_name: string;
  created_at: string;
  icon: string;
}

interface RevenueData {
  tier: string;
  clients: number;
  mrr: number;
}

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export function OrangeDoorDashboard({ 
  onNavigate,
  onAddClient 
}: { 
  onNavigate: (section: string) => void;
  onAddClient: () => void;
}) {
  const [activeClients, setActiveClients] = useState(0);
  const [mrr, setMrr] = useState(0);
  const [aiTasksWeek, setAiTasksWeek] = useState(0);
  const [inactiveClients, setInactiveClients] = useState(0);
  const [clientHealth, setClientHealth] = useState<ClientHealth[]>([]);
  const [aiActivity, setAiActivity] = useState<AIActivity[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [alerts, setAlerts] = useState<{ type: 'red' | 'yellow' | 'warning'; message: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningBatch, setRunningBatch] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateClientId, setGenerateClientId] = useState("");
  const [generateContentType, setGenerateContentType] = useState("Instagram post");
  const [generateTopic, setGenerateTopic] = useState("Why local businesses need a strong online presence");
  const [generating, setGenerating] = useState(false);
  const [seoRunning, setSeoRunning] = useState(false);
  const [seoClientId, setSeoClientId] = useState("");

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Fetch active clients
      const { data: clients } = await supabase
        .from('client_accounts')
        .select('*')
        .eq('status', 'active');

      const activeCount = clients?.length || 0;
      setActiveClients(activeCount);

      // Calculate MRR from tiers
      const tierPricing: Record<string, number> = {
        'foundation': 1250,
        'growth': 2500,
        'transformation': 5000,
        'lead_machine': 3000
      };

      let totalMrr = 0;
      const revenueByTier: Record<string, { clients: number; mrr: number }> = {};

      clients?.forEach(client => {
        const tierPrice = tierPricing[client.tier.toLowerCase()] || 0;
        totalMrr += tierPrice;
        
        if (!revenueByTier[client.tier]) {
          revenueByTier[client.tier] = { clients: 0, mrr: 0 };
        }
        revenueByTier[client.tier].clients++;
        revenueByTier[client.tier].mrr += tierPrice;
      });

      setMrr(totalMrr);
      setRevenueData(
        Object.entries(revenueByTier).map(([tier, data]) => ({
          tier: tier.charAt(0).toUpperCase() + tier.slice(1).replace('_', ' '),
          ...data
        }))
      );

      // Fetch AI tasks from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { data: aiTasks } = await supabase
        .from('client_tasks')
        .select('*')
        .gte('created_at', sevenDaysAgo.toISOString())
        .in('automation_type', ['AI', 'AUTOMATED']);

      setAiTasksWeek(aiTasks?.length || 0);

      // Calculate client health based on last AI task
      const healthData: ClientHealth[] = [];
      let inactiveCount = 0;

      for (const client of clients || []) {
        const { data: lastTask } = await supabase
          .from('client_tasks')
          .select('completed_at')
          .eq('client_account_id', client.id)
          .in('automation_type', ['AI', 'AUTOMATED'])
          .order('completed_at', { ascending: false })
          .limit(1);

        const lastTaskDate = lastTask?.[0]?.completed_at ? new Date(lastTask[0].completed_at) : null;
        const daysSince = lastTaskDate ? differenceInDays(new Date(), lastTaskDate) : 999;
        
        let health: 'green' | 'yellow' | 'red' = 'green';
        if (daysSince > 14) {
          health = 'red';
          inactiveCount++;
        } else if (daysSince > 7) {
          health = 'yellow';
        }

        healthData.push({
          id: client.id,
          business_name: client.business_name,
          tier: client.tier,
          last_ai_task: lastTaskDate,
          status: client.status,
          health,
          mrr: tierPricing[client.tier.toLowerCase()] || 0
        });
      }

      // Sort by health (red first, then yellow, then green)
      healthData.sort((a, b) => {
        const order = { red: 0, yellow: 1, green: 2 };
        return order[a.health] - order[b.health];
      });

      setClientHealth(healthData);
      setInactiveClients(inactiveCount);

      // Fetch AI Activity Feed
      const { data: activities } = await supabase
        .from('activity_feed')
        .select(`
          *,
          client_accounts(business_name)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      setAiActivity(
        (activities || []).map(a => ({
          id: a.id,
          title: a.title,
          description: a.description || '',
          client_name: (a.client_accounts as any)?.business_name || 'Unknown',
          created_at: a.created_at,
          icon: a.icon || 'activity'
        }))
      );

      // Generate alerts
      const alertsList: { type: 'red' | 'yellow' | 'warning'; message: string }[] = [];
      
      const noActivity10Days = healthData.filter(c => {
        if (!c.last_ai_task) return true;
        return differenceInDays(new Date(), c.last_ai_task) >= 10;
      });
      
      noActivity10Days.forEach(c => {
        alertsList.push({
          type: 'red',
          message: `No AI activity in 10+ days: ${c.business_name}`
        });
      });

      setAlerts(alertsList.slice(0, 5));

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRunBatch = async (batchType: 'daily' | 'weekly' | 'monthly') => {
    setRunningBatch(batchType);
    
    const descriptions = {
      daily: 'Processing automated tasks, social posts, and review responses...',
      weekly: 'Generating content, email campaigns, and processing weekly tasks...',
      monthly: 'Running full reports, strategy analysis, and all automated tasks...',
    };

    toast({
      title: `Running ${batchType.charAt(0).toUpperCase() + batchType.slice(1)} AI Batch`,
      description: descriptions[batchType],
    });

    try {
      const { data, error } = await supabase.functions.invoke('run-ai-batch', {
        body: { batchType },
      });

      if (error) throw error;

      toast({
        title: "Batch Complete",
        description: `Processed ${data.results?.processed || 0} clients. Tasks: ${data.results?.tasksCreated || 0}, Content: ${data.results?.contentGenerated || 0}, Reports: ${data.results?.reportsCreated || 0}`,
      });

      // Refresh dashboard data
      fetchDashboardData();
    } catch (error) {
      console.error('Batch error:', error);
      toast({
        title: "Batch Error",
        description: error instanceof Error ? error.message : "Failed to run batch process",
        variant: "destructive",
      });
    } finally {
      setRunningBatch(null);
    }
  };

  const handleFlagClient = (clientId: string) => {
    toast({
      title: "Client Flagged",
      description: "Client has been flagged for review"
    });
  };

  const handleGenerateContent = async () => {
    if (!generateClientId) {
      toast({ title: "Please select a client", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      // Step 1: Trigger task
      const { data: triggerData, error: triggerError } = await supabase.functions.invoke('trigger-task', {
        body: {
          client_id: generateClientId,
          task_type: 'content',
          payload: {
            content_type: generateContentType,
            topic: generateTopic,
          },
        },
      });

      if (triggerError) throw triggerError;
      const taskId = triggerData?.task_id;
      if (!taskId) throw new Error("No task_id returned");

      toast({ title: "Task created", description: "AI is generating content..." });

      // Step 2: Run content agent
      const { data: agentData, error: agentError } = await supabase.functions.invoke('run-content-agent', {
        body: { task_id: taskId },
      });

      if (agentError) throw agentError;

      toast({ title: "Content generated!", description: "The deliverable is now available in the client portal." });
      setGenerateOpen(false);
      fetchDashboardData();
    } catch (error) {
      console.error('Generate content error:', error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const [seoDialogOpen, setSeoDialogOpen] = useState(false);

  const handleRunSeoAudit = async () => {
    if (!seoClientId) {
      toast({ title: "Please select a client", variant: "destructive" });
      return;
    }
    setSeoRunning(true);
    try {
      const { data: triggerData, error: triggerError } = await supabase.functions.invoke('trigger-task', {
        body: {
          client_id: seoClientId,
          task_type: 'seo',
          payload: { analysis_type: 'full_seo_audit' },
        },
      });
      if (triggerError) throw triggerError;
      const taskId = triggerData?.task_id;
      if (!taskId) throw new Error("No task_id returned");

      toast({ title: "SEO audit started", description: "Analysing website..." });

      const { error: agentError } = await supabase.functions.invoke('run-seo-agent', {
        body: { task_id: taskId },
      });
      if (agentError) throw agentError;

      toast({ title: "SEO audit complete!", description: "Results are now available in the client portal." });
      setSeoDialogOpen(false);
      fetchDashboardData();
    } catch (error) {
      console.error('SEO audit error:', error);
      toast({
        title: "SEO audit failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSeoRunning(false);
    }
  };


  const getHealthIcon = (health: 'green' | 'yellow' | 'red') => {
    const colors = {
      green: 'text-emerald-500',
      yellow: 'text-amber-500',
      red: 'text-red-500'
    };
    return <span className={`text-lg ${colors[health]}`}>●</span>;
  };

  const calculateConfidence = (client: ClientHealth) => {
    let score = 0;
    if (client.last_ai_task) {
      const days = differenceInDays(new Date(), client.last_ai_task);
      if (days <= 3) score += 40;
      else if (days <= 7) score += 30;
      else if (days <= 14) score += 15;
    }
    if (client.status === 'active') score += 30;
    score += Math.min(30, (client.mrr / 5000) * 30);
    return Math.min(100, score);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Quick Actions */}
      <motion.div 
        className="flex flex-wrap gap-3"
        initial="hidden"
        animate="visible"
        variants={fadeIn}
      >
        <Button onClick={onAddClient} className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Add New Client
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2" disabled={runningBatch !== null}>
              <RefreshCw className={`w-4 h-4 ${runningBatch ? 'animate-spin' : ''}`} />
              {runningBatch ? `Running ${runningBatch}...` : 'Run AI Batch'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => handleRunBatch('daily')} className="gap-2">
              <Calendar className="w-4 h-4" />
              <div>
                <p className="font-medium">Daily Batch</p>
                <p className="text-xs text-muted-foreground">Social posts, review responses, lead follow-ups</p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleRunBatch('weekly')} className="gap-2">
              <CalendarDays className="w-4 h-4" />
              <div>
                <p className="font-medium">Weekly Batch</p>
                <p className="text-xs text-muted-foreground">Content, email campaigns, SEO audits</p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleRunBatch('monthly')} className="gap-2">
              <CalendarRange className="w-4 h-4" />
              <div>
                <p className="font-medium">Monthly Batch</p>
                <p className="text-xs text-muted-foreground">Full reports, strategy review, competitor analysis</p>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" onClick={() => onNavigate('client-health')} className="gap-2">
          <Flag className="w-4 h-4" /> Flag Client for Review
        </Button>

        <Button variant="outline" onClick={() => setGenerateOpen(true)} className="gap-2">
          <Sparkles className="w-4 h-4" /> Generate Content
        </Button>

        <Button variant="outline" onClick={() => {
          setSeoClientId("");
          setSeoDialogOpen(true);
        }} className="gap-2">
          <Zap className="w-4 h-4" /> Run SEO Audit
        </Button>
      </motion.div>

      {/* Generate Content Dialog */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate AI Content</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Client</Label>
              <Select value={generateClientId} onValueChange={setGenerateClientId}>
                <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
                <SelectContent>
                  {clientHealth.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Content Type</Label>
              <Select value={generateContentType} onValueChange={setGenerateContentType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Instagram post">Instagram Post</SelectItem>
                  <SelectItem value="Facebook post">Facebook Post</SelectItem>
                  <SelectItem value="LinkedIn post">LinkedIn Post</SelectItem>
                  <SelectItem value="Blog intro">Blog Intro</SelectItem>
                  <SelectItem value="Email subject line">Email Subject Line</SelectItem>
                  <SelectItem value="Google Business post">Google Business Post</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Topic</Label>
              <Input
                value={generateTopic}
                onChange={(e) => setGenerateTopic(e.target.value)}
                placeholder="What should the content be about?"
              />
            </div>
            <Button onClick={handleGenerateContent} disabled={generating} className="w-full gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? "Generating..." : "Generate Content"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* SEO Audit Dialog */}
      <Dialog open={seoDialogOpen} onOpenChange={setSeoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run SEO Audit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Client</Label>
              <Select value={seoClientId} onValueChange={setSeoClientId}>
                <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
                <SelectContent>
                  {clientHealth.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleRunSeoAudit} disabled={seoRunning} className="w-full gap-2">
              {seoRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {seoRunning ? "Running audit..." : "Run SEO Audit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      <motion.div 
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        initial="hidden"
        animate="visible"
        variants={fadeIn}
        transition={{ delay: 0.1 }}
      >
        <MetricCard
          label="Active Clients"
          value={activeClients}
          icon={Users}
          color="emerald"
        />
        <MetricCard
          label="MRR"
          value={`$${mrr.toLocaleString()}`}
          icon={DollarSign}
          color="blue"
        />
        <MetricCard
          label="AI Tasks (7 days)"
          value={aiTasksWeek}
          icon={Bot}
          color="purple"
        />
        <MetricCard
          label="No Activity (7 days)"
          value={inactiveClients}
          icon={AlertTriangle}
          color={inactiveClients > 0 ? "red" : "emerald"}
        />
      </motion.div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          transition={{ delay: 0.15 }}
        >
          <Card className="p-4 border-l-4 border-l-red-500 bg-red-500/5">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Alerts
            </h3>
            <div className="space-y-2">
              {alerts.map((alert, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full ${
                    alert.type === 'red' ? 'bg-red-500' : 
                    alert.type === 'yellow' ? 'bg-amber-500' : 'bg-orange-500'
                  }`} />
                  <span className="text-muted-foreground">{alert.message}</span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Client Health Board */}
        <motion.div 
          className="lg:col-span-2"
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          transition={{ delay: 0.2 }}
        >
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Client Health Board</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => onNavigate('client-health')}
                className="gap-1"
              >
                View All <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-3 font-medium">Client</th>
                    <th className="pb-3 font-medium">Package</th>
                    <th className="pb-3 font-medium">Last AI Task</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium text-center">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {clientHealth.slice(0, 8).map((client) => (
                    <tr 
                      key={client.id} 
                      className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => onNavigate('clients')}
                    >
                      <td className="py-3 font-medium">{client.business_name}</td>
                      <td className="py-3">
                        <Badge variant="secondary" className="font-normal">
                          {client.tier}
                        </Badge>
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {client.last_ai_task 
                          ? `${differenceInDays(new Date(), client.last_ai_task)} days ago`
                          : 'Never'
                        }
                      </td>
                      <td className="py-3 capitalize">{client.status}</td>
                      <td className="py-3 text-center">{getHealthIcon(client.health)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>

        {/* Revenue Snapshot */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          transition={{ delay: 0.25 }}
        >
          <Card className="p-6 h-full">
            <h3 className="font-semibold text-lg mb-4">Revenue Snapshot</h3>
            <div className="space-y-3">
              {revenueData.map((item) => (
                <div 
                  key={item.tier} 
                  className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                >
                  <div>
                    <p className="font-medium">{item.tier}</p>
                    <p className="text-sm text-muted-foreground">{item.clients} clients</p>
                  </div>
                  <p className="font-semibold text-lg">${item.mrr.toLocaleString()}</p>
                </div>
              ))}
              <div className="pt-2 border-t-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Total MRR</p>
                  <p className="font-bold text-xl text-primary">${mrr.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* AI Activity Feed */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeIn}
        transition={{ delay: 0.3 }}
      >
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              AI Activity Feed
            </h3>
            <Badge variant="secondary" className="gap-1">
              <Activity className="w-3 h-3" /> Live
            </Badge>
          </div>
          
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {aiActivity.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No recent AI activity</p>
            ) : (
              aiActivity.map((activity) => (
                <div 
                  key={activity.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{activity.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {activity.client_name} • {format(new Date(activity.created_at), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </motion.div>

      {/* Client Detail Preview with AI Confidence */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeIn}
        transition={{ delay: 0.35 }}
      >
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">AI Confidence Overview</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Internal metric based on task completion, content posted, and engagement
          </p>
          <div className="space-y-4">
            {clientHealth.slice(0, 5).map((client) => {
              const confidence = calculateConfidence(client);
              return (
                <div key={client.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{client.business_name}</span>
                    <span className={`font-semibold ${
                      confidence >= 70 ? 'text-emerald-500' :
                      confidence >= 40 ? 'text-amber-500' : 'text-red-500'
                    }`}>
                      {confidence}%
                    </span>
                  </div>
                  <Progress 
                    value={confidence} 
                    className={`h-2 ${
                      confidence >= 70 ? '[&>div]:bg-emerald-500' :
                      confidence >= 40 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

function MetricCard({ 
  label, 
  value, 
  icon: Icon, 
  color 
}: { 
  label: string; 
  value: string | number; 
  icon: any;
  color: 'emerald' | 'blue' | 'purple' | 'red'
}) {
  const colors = {
    emerald: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    red: 'bg-red-500/10 text-red-500 border-red-500/20'
  };

  const iconColors = {
    emerald: 'text-emerald-500',
    blue: 'text-blue-500',
    purple: 'text-purple-500',
    red: 'text-red-500'
  };

  return (
    <Card className={`p-6 border ${colors[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1">{label}</p>
          <p className="text-3xl font-bold">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-full bg-background flex items-center justify-center`}>
          <Icon className={`w-6 h-6 ${iconColors[color]}`} />
        </div>
      </div>
    </Card>
  );
}

export default OrangeDoorDashboard;
