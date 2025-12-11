import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Trophy, 
  TrendingUp, 
  TrendingDown, 
  Target,
  DollarSign,
  Users,
  Search,
  Star,
  Bell,
  Send,
  CheckCircle,
  Clock,
  Zap,
  ArrowUpRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WinNotification {
  id: string;
  clientId: string;
  clientName: string;
  type: "ranking" | "traffic" | "cost" | "conversion" | "review" | "lead";
  title: string;
  description: string;
  metric: string;
  change: number;
  isPositive: boolean;
  timestamp: Date;
  sent: boolean;
  priority: "high" | "medium" | "low";
}

interface ClientAccount {
  id: string;
  business_name: string;
  email: string;
}

// Mock win notifications - in production these would be generated from analytics data
const generateMockWins = (clients: ClientAccount[]): WinNotification[] => {
  const winTypes = [
    {
      type: "ranking" as const,
      templates: [
        { title: "🏆 #1 Ranking Achieved!", description: "You just ranked #1 for '{keyword}'", metric: "Position", change: 100 },
        { title: "📈 Top 3 for New Keyword", description: "Now ranking #3 for '{keyword}'", metric: "Position", change: 85 },
        { title: "🚀 Keyword Jump!", description: "'{keyword}' moved from page 2 to page 1", metric: "Position", change: 70 },
      ]
    },
    {
      type: "traffic" as const,
      templates: [
        { title: "🔥 Traffic Surge!", description: "Your site traffic increased {change}% this week", metric: "Visitors", change: 18 },
        { title: "📊 Record Month!", description: "Highest monthly traffic ever recorded", metric: "Visitors", change: 25 },
        { title: "🌐 Organic Growth", description: "Organic search traffic up {change}%", metric: "Organic Visits", change: 32 },
      ]
    },
    {
      type: "cost" as const,
      templates: [
        { title: "💰 Cost Savings!", description: "Your ad cost-per-lead decreased {change}% this month", metric: "CPL", change: -23 },
        { title: "📉 CPC Reduction", description: "Cost per click down {change}%", metric: "CPC", change: -15 },
        { title: "🎯 Better ROI", description: "Return on ad spend improved by {change}%", metric: "ROAS", change: 40 },
      ]
    },
    {
      type: "conversion" as const,
      templates: [
        { title: "✅ Conversion Boost!", description: "Conversion rate increased to {change}%", metric: "Conv. Rate", change: 12 },
        { title: "📱 Mobile Wins", description: "Mobile conversions up {change}%", metric: "Mobile Conv.", change: 28 },
        { title: "🛒 More Sales", description: "E-commerce revenue up {change}%", metric: "Revenue", change: 35 },
      ]
    },
    {
      type: "review" as const,
      templates: [
        { title: "⭐ 5-Star Review!", description: "You received a new 5-star review", metric: "Rating", change: 5 },
        { title: "🌟 Rating Improved", description: "Your average rating increased to {change} stars", metric: "Avg Rating", change: 4.8 },
        { title: "💬 Review Milestone", description: "You've now reached {change} total reviews", metric: "Reviews", change: 100 },
      ]
    },
    {
      type: "lead" as const,
      templates: [
        { title: "📞 Lead Surge!", description: "You received {change} new leads this week", metric: "Leads", change: 15 },
        { title: "🔔 High-Intent Lead", description: "A high-intent lead just submitted a form", metric: "Lead Score", change: 95 },
        { title: "📧 Form Submissions Up", description: "Contact form submissions increased {change}%", metric: "Submissions", change: 45 },
      ]
    }
  ];

  const keywords = ["roof repair Knoxville", "plumber near me", "best dentist", "HVAC service", "auto repair shop", "family lawyer"];
  
  return clients.flatMap(client => {
    const numWins = Math.floor(Math.random() * 4) + 1;
    const wins: WinNotification[] = [];
    
    for (let i = 0; i < numWins; i++) {
      const winType = winTypes[Math.floor(Math.random() * winTypes.length)];
      const template = winType.templates[Math.floor(Math.random() * winType.templates.length)];
      const keyword = keywords[Math.floor(Math.random() * keywords.length)];
      const change = template.change + (Math.random() * 10 - 5);
      
      wins.push({
        id: `${client.id}-${i}-${Date.now()}`,
        clientId: client.id,
        clientName: client.business_name,
        type: winType.type,
        title: template.title,
        description: template.description
          .replace("{keyword}", keyword)
          .replace("{change}", Math.abs(Math.round(change)).toString()),
        metric: template.metric,
        change: Math.round(change * 10) / 10,
        isPositive: change > 0 || winType.type === "cost",
        timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        sent: Math.random() > 0.3,
        priority: Math.random() > 0.7 ? "high" : Math.random() > 0.4 ? "medium" : "low"
      });
    }
    
    return wins;
  }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
};

export default function ClientWinNotifications() {
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [wins, setWins] = useState<WinNotification[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [autoNotify, setAutoNotify] = useState(true);
  const [selectedType, setSelectedType] = useState<string>("all");

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from("client_accounts")
        .select("id, business_name, email")
        .order("business_name");

      if (error) throw error;
      setClients(data || []);
      setWins(generateMockWins(data || []));
    } catch (error) {
      console.error("Error fetching clients:", error);
      toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  };

  const sendNotification = (win: WinNotification) => {
    toast.success(`Notification sent to ${win.clientName}!`);
    setWins(prev => prev.map(w => w.id === win.id ? { ...w, sent: true } : w));
  };

  const sendAllUnsent = () => {
    const unsent = filteredWins.filter(w => !w.sent);
    unsent.forEach(win => {
      setWins(prev => prev.map(w => w.id === win.id ? { ...w, sent: true } : w));
    });
    toast.success(`Sent ${unsent.length} notifications!`);
  };

  const getTypeIcon = (type: WinNotification["type"]) => {
    switch (type) {
      case "ranking": return <Search className="h-4 w-4" />;
      case "traffic": return <TrendingUp className="h-4 w-4" />;
      case "cost": return <DollarSign className="h-4 w-4" />;
      case "conversion": return <Target className="h-4 w-4" />;
      case "review": return <Star className="h-4 w-4" />;
      case "lead": return <Users className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: WinNotification["type"]) => {
    switch (type) {
      case "ranking": return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "traffic": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "cost": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "conversion": return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "review": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "lead": return "bg-pink-500/10 text-pink-500 border-pink-500/20";
    }
  };

  const getPriorityColor = (priority: WinNotification["priority"]) => {
    switch (priority) {
      case "high": return "bg-red-500/10 text-red-500";
      case "medium": return "bg-yellow-500/10 text-yellow-500";
      case "low": return "bg-muted text-muted-foreground";
    }
  };

  const filteredWins = wins.filter(win => {
    if (selectedClient !== "all" && win.clientId !== selectedClient) return false;
    if (selectedType !== "all" && win.type !== selectedType) return false;
    return true;
  });

  const unsentCount = filteredWins.filter(w => !w.sent).length;
  const highPriorityCount = filteredWins.filter(w => w.priority === "high" && !w.sent).length;

  const stats = {
    total: filteredWins.length,
    sent: filteredWins.filter(w => w.sent).length,
    pending: unsentCount,
    highPriority: highPriorityCount
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            Client Win Notifications
          </h2>
          <p className="text-muted-foreground">
            Automated brag moments that make Orange Door feel high-touch
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="auto-notify"
              checked={autoNotify}
              onCheckedChange={setAutoNotify}
            />
            <Label htmlFor="auto-notify">Auto-send notifications</Label>
          </div>
          <Button onClick={sendAllUnsent} disabled={unsentCount === 0}>
            <Send className="h-4 w-4 mr-2" />
            Send All ({unsentCount})
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Wins</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">This week</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sent</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats.sent}</div>
            <p className="text-xs text-muted-foreground">Notifications delivered</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Awaiting delivery</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">High Priority</CardTitle>
            <Zap className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{stats.highPriority}</div>
            <p className="text-xs text-muted-foreground">Urgent wins</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={selectedClient} onValueChange={setSelectedClient}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map(client => (
              <SelectItem key={client.id} value={client.id}>
                {client.business_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="ranking">🏆 Rankings</SelectItem>
            <SelectItem value="traffic">📈 Traffic</SelectItem>
            <SelectItem value="cost">💰 Cost Savings</SelectItem>
            <SelectItem value="conversion">✅ Conversions</SelectItem>
            <SelectItem value="review">⭐ Reviews</SelectItem>
            <SelectItem value="lead">📞 Leads</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Notifications List */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All ({filteredWins.length})</TabsTrigger>
          <TabsTrigger value="unsent">Pending ({unsentCount})</TabsTrigger>
          <TabsTrigger value="sent">Sent ({stats.sent})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {filteredWins.map(win => (
            <WinCard key={win.id} win={win} onSend={sendNotification} getTypeIcon={getTypeIcon} getTypeColor={getTypeColor} getPriorityColor={getPriorityColor} />
          ))}
        </TabsContent>

        <TabsContent value="unsent" className="space-y-4">
          {filteredWins.filter(w => !w.sent).map(win => (
            <WinCard key={win.id} win={win} onSend={sendNotification} getTypeIcon={getTypeIcon} getTypeColor={getTypeColor} getPriorityColor={getPriorityColor} />
          ))}
        </TabsContent>

        <TabsContent value="sent" className="space-y-4">
          {filteredWins.filter(w => w.sent).map(win => (
            <WinCard key={win.id} win={win} onSend={sendNotification} getTypeIcon={getTypeIcon} getTypeColor={getTypeColor} getPriorityColor={getPriorityColor} />
          ))}
        </TabsContent>
      </Tabs>

      {filteredWins.length === 0 && (
        <Card className="p-8 text-center">
          <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No wins found</h3>
          <p className="text-muted-foreground">
            Wins will appear here as your clients achieve milestones
          </p>
        </Card>
      )}
    </div>
  );
}

interface WinCardProps {
  win: WinNotification;
  onSend: (win: WinNotification) => void;
  getTypeIcon: (type: WinNotification["type"]) => React.ReactNode;
  getTypeColor: (type: WinNotification["type"]) => string;
  getPriorityColor: (priority: WinNotification["priority"]) => string;
}

function WinCard({ win, onSend, getTypeIcon, getTypeColor, getPriorityColor }: WinCardProps) {
  return (
    <Card className={`transition-all hover:shadow-md ${win.sent ? "opacity-75" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-lg border ${getTypeColor(win.type)}`}>
              {getTypeIcon(win.type)}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold">{win.title}</h4>
                <Badge variant="outline" className={getPriorityColor(win.priority)}>
                  {win.priority}
                </Badge>
                {win.sent && (
                  <Badge variant="outline" className="bg-green-500/10 text-green-500">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Sent
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{win.description}</p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="font-medium">{win.clientName}</span>
                <span>•</span>
                <span>{win.metric}: {win.isPositive ? "+" : ""}{win.change}{win.type === "cost" ? "%" : ""}</span>
                <span>•</span>
                <span>{new Date(win.timestamp).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!win.sent && (
              <Button size="sm" onClick={() => onSend(win)}>
                <Send className="h-4 w-4 mr-2" />
                Send
              </Button>
            )}
            <Button size="sm" variant="outline">
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
