import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import {
  FileText,
  Send,
  Download,
  Copy,
  RefreshCw,
  CheckCircle2,
  Clock,
  MessageSquare,
  FileCheck,
  Building2,
  TrendingUp,
  AlertTriangle
} from "lucide-react";

interface DailyDigestGeneratorProps {
  adminPassword: string;
}

export function DailyDigestGenerator({ adminPassword }: DailyDigestGeneratorProps) {
  const [generatedDigest, setGeneratedDigest] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);

  const today = new Date();
  const yesterday = subDays(today, 1);

  // Fetch today's completed tasks
  const { data: completedTasks = [] } = useQuery({
    queryKey: ["digest-completed-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_tasks")
        .select(`
          *,
          client_accounts (business_name)
        `)
        .gte("completed_at", startOfDay(yesterday).toISOString())
        .lte("completed_at", endOfDay(today).toISOString())
        .eq("status", "completed");
      if (error) throw error;
      return data;
    }
  });

  // Fetch pending tasks
  const { data: pendingTasks = [] } = useQuery({
    queryKey: ["digest-pending-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_tasks")
        .select(`
          *,
          client_accounts (business_name)
        `)
        .eq("status", "pending")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(20);
      if (error) throw error;
      return data;
    }
  });

  // Fetch recent client messages
  const { data: recentMessages = [] } = useQuery({
    queryKey: ["digest-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_messages")
        .select(`
          *,
          client_accounts (business_name)
        `)
        .gte("created_at", startOfDay(yesterday).toISOString())
        .eq("sender_type", "client")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // Fetch delivered items
  const { data: deliverables = [] } = useQuery({
    queryKey: ["digest-deliverables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliverables")
        .select(`
          *,
          client_accounts (business_name)
        `)
        .gte("submitted_at", startOfDay(yesterday).toISOString())
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // For now, skip health scores as the table isn't in types yet
  const healthScores: any[] = [];

  // Fetch past digests
  const { data: pastDigests = [], refetch: refetchDigests } = useQuery({
    queryKey: ["past-digests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_digests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    }
  });

  const saveDigest = async (content: string) => {
    const { error } = await supabase
      .from("daily_digests")
      .insert({
        generated_for: format(today, "yyyy-MM-dd"),
        content: { text: content, generated_at: new Date().toISOString() }
      });
    
    if (error) {
      toast.error("Failed to save digest");
      return;
    }
    
    refetchDigests();
    toast.success("Digest saved!");
  };

  const generateDigest = () => {
    setIsGenerating(true);
    
    // Group completed tasks by client
    const completedByClient: Record<string, any[]> = {};
    completedTasks.forEach(task => {
      const clientName = task.client_accounts?.business_name || "Unknown";
      if (!completedByClient[clientName]) completedByClient[clientName] = [];
      completedByClient[clientName].push(task);
    });

    // Group pending tasks by client
    const pendingByClient: Record<string, any[]> = {};
    pendingTasks.forEach(task => {
      const clientName = task.client_accounts?.business_name || "Unknown";
      if (!pendingByClient[clientName]) pendingByClient[clientName] = [];
      pendingByClient[clientName].push(task);
    });

    const overdueTasks = pendingTasks.filter(t => t.due_date && new Date(t.due_date) < today);

    let digest = `# Daily Digest - ${format(today, "MMMM d, yyyy")}\n\n`;
    
    // Summary section
    digest += `## 📊 Summary\n`;
    digest += `- **Tasks Completed**: ${completedTasks.length}\n`;
    digest += `- **Pending Tasks**: ${pendingTasks.length}\n`;
    digest += `- **Overdue Tasks**: ${overdueTasks.length}\n`;
    digest += `- **Client Messages**: ${recentMessages.length}\n`;
    digest += `- **Deliverables Submitted**: ${deliverables.length}\n`;
    digest += `- **Clients Needing Attention**: ${healthScores.length}\n\n`;

    // Completed work section
    if (completedTasks.length > 0) {
      digest += `## ✅ Work Completed\n`;
      Object.entries(completedByClient).forEach(([client, tasks]) => {
        digest += `\n### ${client}\n`;
        tasks.forEach(task => {
          digest += `- ${task.name} (${task.category})\n`;
        });
      });
      digest += `\n`;
    }

    // Overdue tasks section
    if (overdueTasks.length > 0) {
      digest += `## ⚠️ Overdue Tasks\n`;
      overdueTasks.forEach(task => {
        digest += `- **${task.client_accounts?.business_name}**: ${task.name} (Due: ${format(new Date(task.due_date!), "MMM d")})\n`;
      });
      digest += `\n`;
    }

    // Skip health scores section for now

    // Client messages
    if (recentMessages.length > 0) {
      digest += `## 💬 Recent Client Messages\n`;
      recentMessages.slice(0, 10).forEach(msg => {
        digest += `- **${msg.client_accounts?.business_name}**: "${msg.message.slice(0, 100)}${msg.message.length > 100 ? '...' : ''}"\n`;
      });
      digest += `\n`;
    }

    // Upcoming work
    if (pendingTasks.length > 0) {
      digest += `## 📋 Upcoming Tasks\n`;
      const urgentTasks = pendingTasks.filter(t => t.due_date && new Date(t.due_date) <= subDays(today, -3));
      if (urgentTasks.length > 0) {
        digest += `\n### Due Within 3 Days\n`;
        urgentTasks.forEach(task => {
          digest += `- **${task.client_accounts?.business_name}**: ${task.name}`;
          if (task.due_date) digest += ` (Due: ${format(new Date(task.due_date), "MMM d")})`;
          digest += `\n`;
        });
      }
    }

    // Deliverables
    if (deliverables.length > 0) {
      digest += `\n## 📦 Deliverables Submitted\n`;
      deliverables.forEach(d => {
        digest += `- **${d.client_accounts?.business_name}**: ${d.title} (${d.status})\n`;
      });
    }

    digest += `\n---\n*Generated at ${format(new Date(), "h:mm a")}*`;
    
    setGeneratedDigest(digest);
    setIsGenerating(false);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedDigest);
    toast.success("Copied to clipboard!");
  };

  const downloadDigest = () => {
    const blob = new Blob([generatedDigest], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-digest-${format(today, "yyyy-MM-dd")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Daily Digest Generator</h2>
          <p className="text-muted-foreground">
            Generate a summary of today's activities across all clients
          </p>
        </div>
        <Button onClick={generateDigest} disabled={isGenerating}>
          {isGenerating ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileText className="h-4 w-4 mr-2" />
          )}
          Generate Digest
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{completedTasks.length}</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              <div>
                <div className="text-2xl font-bold">{pendingTasks.length}</div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <div className="text-2xl font-bold">
                  {pendingTasks.filter(t => t.due_date && new Date(t.due_date) < today).length}
                </div>
                <div className="text-xs text-muted-foreground">Overdue</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{recentMessages.length}</div>
                <div className="text-xs text-muted-foreground">Messages</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">{deliverables.length}</div>
                <div className="text-xs text-muted-foreground">Deliverables</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-red-500" />
              <div>
                <div className="text-2xl font-bold">{healthScores.length}</div>
                <div className="text-xs text-muted-foreground">Need Attention</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Generated Digest */}
      {generatedDigest && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Generated Digest</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={copyToClipboard}>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
                <Button variant="outline" size="sm" onClick={downloadDigest}>
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => saveDigest(generatedDigest)}
                >
                  <Send className="h-4 w-4 mr-1" />
                  Save
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              <Textarea
                value={generatedDigest}
                onChange={(e) => setGeneratedDigest(e.target.value)}
                className="min-h-[480px] font-mono text-sm"
              />
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Recent Digests */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Digests</CardTitle>
          <CardDescription>Previously generated daily digests</CardDescription>
        </CardHeader>
        <CardContent>
          <DigestHistory digests={pastDigests} />
        </CardContent>
      </Card>
    </div>
  );
}

function DigestHistory({ digests }: { digests: any[] }) {
  if (digests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No previous digests found.</p>
    );
  }

  return (
    <div className="space-y-2">
      {digests.map((digest: any) => (
        <div key={digest.id} className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {format(new Date(digest.generated_for), "MMMM d, yyyy")}
            </span>
          </div>
          <span className="text-sm text-muted-foreground">
            Generated {format(new Date(digest.created_at), "h:mm a")}
          </span>
        </div>
      ))}
    </div>
  );
}