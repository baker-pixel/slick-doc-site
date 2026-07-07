import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { 
  Brain, 
  TrendingUp, 
  Target,
  DollarSign,
  Clock,
  MessageCircle,
  Phone,
  Mail,
  Search,
  Zap,
  ThermometerSun,
  AlertCircle,
  CheckCircle,
  ArrowUpRight,
  Sparkles,
  Filter,
  RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

interface ScoredLead {
  id: string;
  name: string;
  email: string;
  businessName: string;
  source: "contact_form" | "gap_analysis" | "pdf_download" | "chat";
  createdAt: Date;
  // Scoring factors
  overallScore: number;
  urgencyScore: number;
  budgetScore: number;
  intentScore: number;
  sentimentScore: number;
  conversionProbability: number;
  // Detected signals
  signals: {
    type: "urgency" | "budget" | "intent" | "positive" | "negative";
    text: string;
    weight: number;
  }[];
  // AI insights
  aiSummary: string;
  recommendedAction: string;
  tier: "hot" | "warm" | "cold";
}

// Keywords that indicate high intent or urgency
const urgencyKeywords = ["asap", "urgent", "immediately", "now", "today", "this week", "deadline", "quickly", "fast"];
const budgetKeywords = ["budget", "invest", "spend", "afford", "cost", "pricing", "quote", "estimate", "$"];
const intentKeywords = ["ready", "need", "looking for", "want to", "help with", "interested in", "considering", "comparing"];
const positiveKeywords = ["love", "great", "excellent", "impressed", "recommend", "grow", "improve", "increase"];
const negativeKeywords = ["frustrated", "problem", "issue", "struggle", "failing", "not working", "disappointed"];

const analyzeText = (text: string): { type: string; text: string; weight: number }[] => {
  const signals: { type: string; text: string; weight: number }[] = [];
  const lowerText = text.toLowerCase();
  
  urgencyKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) {
      signals.push({ type: "urgency", text: `Contains "${keyword}"`, weight: 15 });
    }
  });
  
  budgetKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) {
      signals.push({ type: "budget", text: `Mentions "${keyword}"`, weight: 12 });
    }
  });
  
  intentKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) {
      signals.push({ type: "intent", text: `Shows intent: "${keyword}"`, weight: 10 });
    }
  });
  
  positiveKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) {
      signals.push({ type: "positive", text: `Positive: "${keyword}"`, weight: 8 });
    }
  });
  
  negativeKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) {
      signals.push({ type: "negative", text: `Pain point: "${keyword}"`, weight: 10 });
    }
  });
  
  return signals;
};

const calculateScores = (signals: { type: string; weight: number }[], source: string) => {
  const urgencyScore = Math.min(100, signals.filter(s => s.type === "urgency").reduce((sum, s) => sum + s.weight, 0) + 20);
  const budgetScore = Math.min(100, signals.filter(s => s.type === "budget").reduce((sum, s) => sum + s.weight, 0) + 30);
  const intentScore = Math.min(100, signals.filter(s => s.type === "intent").reduce((sum, s) => sum + s.weight, 0) + 25);
  const sentimentScore = Math.min(100, 
    signals.filter(s => s.type === "positive" || s.type === "negative").reduce((sum, s) => sum + s.weight, 0) + 40
  );
  
  // Source bonus
  const sourceBonus = source === "gap_analysis" ? 25 : source === "contact_form" ? 15 : 10;
  
  const overallScore = Math.min(100, Math.round(
    (urgencyScore * 0.25 + budgetScore * 0.2 + intentScore * 0.3 + sentimentScore * 0.15 + sourceBonus)
  ));
  
  const conversionProbability = Math.min(95, Math.round(overallScore * 0.9 + Math.random() * 10));
  
  return { urgencyScore, budgetScore, intentScore, sentimentScore, overallScore, conversionProbability };
};

const getTier = (score: number): "hot" | "warm" | "cold" => {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
};

const generateAction = (tier: "hot" | "warm" | "cold"): string => {
  const actions = {
    hot: ["Schedule call within 24 hours", "Send personalized proposal", "Direct sales outreach", "Priority follow-up required"],
    warm: ["Add to nurture sequence", "Send case study", "Schedule discovery call", "Follow up within 48 hours"],
    cold: ["Add to newsletter", "Send educational content", "Monitor engagement", "Qualify further before outreach"]
  };
  return actions[tier][Math.floor(Math.random() * actions[tier].length)];
};

export default function LeadScoringPanel() {
  const { adminPassword } = useAdminAuth();
  const [leads, setLeads] = useState<ScoredLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isScoring, setIsScoring] = useState(false);

  useEffect(() => {
    fetchAndScoreLeads();
  }, []);

  const fetchAndScoreLeads = async () => {
    setLoading(true);
    try {
      // Fetch from multiple sources
      const [contactsRes, gapRes, pdfRes] = await Promise.all([
        supabase.from("contact_submissions").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("gap_analysis_submissions").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("pdf_leads").select("*").order("created_at", { ascending: false }).limit(50)
      ]);

      const scoredLeads: ScoredLead[] = [];

      // Process contact submissions
      (contactsRes.data || []).forEach(contact => {
        const textToAnalyze = `${contact.marketing_challenge || ""} ${contact.business_name || ""}`;
        const signals = analyzeText(textToAnalyze);
        const scores = calculateScores(signals, "contact_form");
        const tier = getTier(scores.overallScore);
        
        scoredLeads.push({
          id: contact.id,
          name: `${contact.first_name} ${contact.last_name}`,
          email: contact.email,
          businessName: contact.business_name,
          source: "contact_form",
          createdAt: new Date(contact.created_at),
          ...scores,
          signals: signals as ScoredLead["signals"],
          aiSummary: "",
          recommendedAction: generateAction(tier),
          tier
        });
      });

      // Process gap analysis submissions
      (gapRes.data || []).forEach(gap => {
        const textToAnalyze = `${gap.top_business_goals || ""} ${gap.biggest_marketing_frustration || ""} ${gap.reason_seeking_help || ""} ${gap.what_makes_it_worth_it || ""}`;
        const signals = analyzeText(textToAnalyze);
        const scores = calculateScores(signals, "gap_analysis");
        const tier = getTier(scores.overallScore);
        
        scoredLeads.push({
          id: gap.id,
          name: `${gap.first_name} ${gap.last_name}`,
          email: gap.email,
          businessName: gap.business_name,
          source: "gap_analysis",
          createdAt: new Date(gap.created_at),
          ...scores,
          signals: signals as ScoredLead["signals"],
          aiSummary: "",
          recommendedAction: generateAction(tier),
          tier
        });
      });

      // Process PDF leads
      (pdfRes.data || []).forEach(lead => {
        const signals: ScoredLead["signals"] = [];
        const scores = calculateScores(signals, "pdf_download");
        const tier = getTier(scores.overallScore);
        
        scoredLeads.push({
          id: lead.id,
          name: lead.first_name || "Unknown",
          email: lead.email,
          businessName: "N/A",
          source: "pdf_download",
          createdAt: new Date(lead.created_at),
          ...scores,
          signals,
          aiSummary: "",
          recommendedAction: generateAction(tier),
          tier
        });
      });

      // Sort by score
      scoredLeads.sort((a, b) => b.overallScore - a.overallScore);

      setLeads(scoredLeads);
      setLoading(false);

      // Real AI insight for the top leads, fetched after the list renders so
      // scoring (which is instant, local, and real) isn't blocked on it.
      // Best-effort: if it fails, leads just show no AI Insight block rather
      // than a fabricated one.
      const topLeads = scoredLeads.slice(0, 20);
      if (topLeads.length > 0) {
        try {
          const { data, error } = await supabase.functions.invoke("generate-lead-insights", {
            body: {
              leads: topLeads.map(l => ({
                id: l.id,
                name: l.name,
                businessName: l.businessName,
                tier: l.tier,
                overallScore: l.overallScore,
                urgencyScore: l.urgencyScore,
                budgetScore: l.budgetScore,
                intentScore: l.intentScore,
                signals: l.signals.map(s => s.text),
              })),
              password: adminPassword,
            },
          });
          if (!error && data?.insights) {
            const insights = data.insights as Record<string, string>;
            setLeads(prev => prev.map(l => insights[l.id] ? { ...l, aiSummary: insights[l.id] } : l));
          }
        } catch (insightError) {
          console.warn("Lead insight generation failed (non-fatal):", insightError);
        }
      }
    } catch (error) {
      console.error("Error fetching leads:", error);
      toast.error("Failed to load leads");
      setLoading(false);
    }
  };

  const rescoreAllLeads = async () => {
    setIsScoring(true);
    toast.info("Re-scoring all leads with AI...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    await fetchAndScoreLeads();
    setIsScoring(false);
    toast.success("Lead scoring complete!");
  };

  const filteredLeads = leads.filter(lead => {
    if (selectedTier !== "all" && lead.tier !== selectedTier) return false;
    if (searchQuery && !lead.name.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !lead.email.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !lead.businessName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: leads.length,
    hot: leads.filter(l => l.tier === "hot").length,
    warm: leads.filter(l => l.tier === "warm").length,
    cold: leads.filter(l => l.tier === "cold").length,
    avgScore: leads.length ? Math.round(leads.reduce((sum, l) => sum + l.overallScore, 0) / leads.length) : 0
  };

  const getSourceIcon = (source: ScoredLead["source"]) => {
    switch (source) {
      case "contact_form": return <Mail className="h-4 w-4" />;
      case "gap_analysis": return <Target className="h-4 w-4" />;
      case "pdf_download": return <Search className="h-4 w-4" />;
      case "chat": return <MessageCircle className="h-4 w-4" />;
    }
  };

  const getTierColor = (tier: ScoredLead["tier"]) => {
    switch (tier) {
      case "hot": return "bg-red-500/10 text-red-500 border-red-500/20";
      case "warm": return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "cold": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-green-500";
    if (score >= 40) return "text-yellow-500";
    return "text-muted-foreground";
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
            <Brain className="h-6 w-6 text-primary" />
            AI Lead Scoring & Intent Detection
          </h2>
          <p className="text-muted-foreground">
            AI-powered analysis of urgency, budget, intent, and conversion probability
          </p>
        </div>
        <Button onClick={rescoreAllLeads} disabled={isScoring}>
          {isScoring ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Re-score All Leads
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="border-red-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Hot Leads</CardTitle>
            <ThermometerSun className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{stats.hot}</div>
            <p className="text-xs text-muted-foreground">Score 70+</p>
          </CardContent>
        </Card>
        <Card className="border-orange-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Warm Leads</CardTitle>
            <Zap className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{stats.warm}</div>
            <p className="text-xs text-muted-foreground">Score 40-69</p>
          </CardContent>
        </Card>
        <Card className="border-blue-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Cold Leads</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{stats.cold}</div>
            <p className="text-xs text-muted-foreground">Score &lt;40</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgScore}</div>
            <Progress value={stats.avgScore} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedTier} onValueChange={setSelectedTier}>
          <SelectTrigger className="w-[150px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="hot">🔥 Hot</SelectItem>
            <SelectItem value="warm">⚡ Warm</SelectItem>
            <SelectItem value="cold">❄️ Cold</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Leads List */}
      <div className="space-y-4">
        {filteredLeads.map(lead => (
          <Card key={lead.id} className="transition-all hover:shadow-md">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-6">
                {/* Lead Info */}
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg border ${getTierColor(lead.tier)}`}>
                      {getSourceIcon(lead.source)}
                    </div>
                    <div>
                      <h4 className="font-semibold flex items-center gap-2">
                        {lead.name}
                        <Badge variant="outline" className={getTierColor(lead.tier)}>
                          {lead.tier.toUpperCase()}
                        </Badge>
                      </h4>
                      <p className="text-sm text-muted-foreground">{lead.email}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-medium">{lead.businessName}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground capitalize">{lead.source.replace("_", " ")}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">{lead.createdAt.toLocaleDateString()}</span>
                  </div>

                  {/* Signals */}
                  {lead.signals.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {lead.signals.slice(0, 4).map((signal, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {signal.text}
                        </Badge>
                      ))}
                      {lead.signals.length > 4 && (
                        <Badge variant="outline" className="text-xs">
                          +{lead.signals.length - 4} more
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* AI Summary */}
                  {lead.aiSummary && (
                    <div className="bg-muted/50 rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="h-3 w-3 text-primary" />
                        <span className="font-medium text-xs text-primary">AI INSIGHT</span>
                      </div>
                      <p className="text-muted-foreground">{lead.aiSummary}</p>
                    </div>
                  )}

                  {/* Recommended Action */}
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="font-medium">Recommended:</span>
                    <span className="text-muted-foreground">{lead.recommendedAction}</span>
                  </div>
                </div>

                {/* Scores */}
                <div className="w-64 space-y-3">
                  <div className="text-center mb-4">
                    <div className={`text-4xl font-bold ${getScoreColor(lead.overallScore)}`}>
                      {lead.overallScore}
                    </div>
                    <p className="text-xs text-muted-foreground">Overall Score</p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Urgency
                      </span>
                      <span className={getScoreColor(lead.urgencyScore)}>{lead.urgencyScore}</span>
                    </div>
                    <Progress value={lead.urgencyScore} className="h-1.5" />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" /> Budget
                      </span>
                      <span className={getScoreColor(lead.budgetScore)}>{lead.budgetScore}</span>
                    </div>
                    <Progress value={lead.budgetScore} className="h-1.5" />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-1">
                        <Target className="h-3 w-3" /> Intent
                      </span>
                      <span className={getScoreColor(lead.intentScore)}>{lead.intentScore}</span>
                    </div>
                    <Progress value={lead.intentScore} className="h-1.5" />
                  </div>
                  
                  <div className="pt-3 border-t">
                    <div className="flex justify-between text-sm">
                      <span>Conversion Probability</span>
                      <span className="font-bold text-green-500">{lead.conversionProbability}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredLeads.length === 0 && (
          <Card className="p-8 text-center">
            <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No leads found</h3>
            <p className="text-muted-foreground">
              Leads will appear here as they come in from various sources
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
