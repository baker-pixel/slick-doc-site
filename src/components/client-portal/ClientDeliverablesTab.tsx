import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { 
  Package, 
  Star, 
  Download, 
  Eye, 
  CheckCircle2, 
  XCircle, 
  RotateCcw, 
  FileText,
  Clock,
  Sparkles,
  FileImage,
  FileCode,
  Presentation,
  ChevronRight,
  Calendar,
  TrendingUp,
  TrendingDown,
  Target,
  Lightbulb,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Users,
  Globe,
  Mail,
  Search,
  Share2,
  DollarSign,
  Percent,
  MousePointerClick,
  Timer,
  Award,
  ThumbsUp,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format } from "date-fns";

interface Deliverable {
  id: string;
  title: string;
  description: string | null;
  category: string;
  file_url: string | null;
  file_name: string | null;
  preview_url: string | null;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
  rating: number | null;
  feedback: string | null;
  revision_notes: string | null;
  revision_count: number;
}

interface ClientDeliverablesTabProps {
  clientAccountId: string;
}

const statusConfig: Record<string, { 
  label: string; 
  bgColor: string; 
  textColor: string; 
  borderColor: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  pending_review: { 
    label: "Awaiting Your Review", 
    bgColor: "bg-amber-500/10", 
    textColor: "text-amber-600 dark:text-amber-400",
    borderColor: "border-amber-500/30",
    icon: Clock 
  },
  approved: { 
    label: "Approved", 
    bgColor: "bg-emerald-500/10", 
    textColor: "text-emerald-600 dark:text-emerald-400",
    borderColor: "border-emerald-500/30",
    icon: CheckCircle2 
  },
  revision_requested: { 
    label: "Revision in Progress", 
    bgColor: "bg-blue-500/10", 
    textColor: "text-blue-600 dark:text-blue-400",
    borderColor: "border-blue-500/30",
    icon: RotateCcw 
  },
  rejected: { 
    label: "Rejected", 
    bgColor: "bg-red-500/10", 
    textColor: "text-red-600 dark:text-red-400",
    borderColor: "border-red-500/30",
    icon: XCircle 
  },
};

const categoryConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  report: { icon: FileText, label: "Report" },
  design: { icon: FileImage, label: "Design" },
  content: { icon: FileCode, label: "Content" },
  presentation: { icon: Presentation, label: "Presentation" },
  general: { icon: Package, label: "Deliverable" },
};

// Parse JSON content from description
function parseReportContent(content: string | null): { 
  isJson: boolean; 
  data: Record<string, unknown> | null;
  markdown: string | null;
} {
  if (!content) return { isJson: false, data: null, markdown: null };
  
  try {
    const parsed = JSON.parse(content);
    return { isJson: true, data: parsed, markdown: null };
  } catch {
    return { isJson: false, data: null, markdown: content };
  }
}

// Format metric value for display
function formatMetricValue(value: unknown): string {
  if (typeof value === 'number') {
    if (value > 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value > 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString();
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

// Get icon for metric type
function getMetricIcon(key: string): React.ComponentType<{ className?: string }> {
  const lowerKey = key.toLowerCase();
  if (lowerKey.includes('traffic') || lowerKey.includes('visitor') || lowerKey.includes('session')) return Users;
  if (lowerKey.includes('conversion') || lowerKey.includes('lead')) return Target;
  if (lowerKey.includes('revenue') || lowerKey.includes('spend') || lowerKey.includes('cost') || lowerKey.includes('cpa') || lowerKey.includes('cpc')) return DollarSign;
  if (lowerKey.includes('rate') || lowerKey.includes('ctr') || lowerKey.includes('percentage')) return Percent;
  if (lowerKey.includes('click')) return MousePointerClick;
  if (lowerKey.includes('time') || lowerKey.includes('duration')) return Timer;
  if (lowerKey.includes('email') || lowerKey.includes('open')) return Mail;
  if (lowerKey.includes('social') || lowerKey.includes('engagement')) return Share2;
  if (lowerKey.includes('seo') || lowerKey.includes('search') || lowerKey.includes('ranking')) return Search;
  if (lowerKey.includes('score')) return Award;
  if (lowerKey.includes('bounce')) return ArrowDownRight;
  return BarChart3;
}

// Collapsible section component
function CollapsibleSection({ 
  title, 
  icon: Icon, 
  children, 
  defaultOpen = true,
  count,
  color = "primary"
}: { 
  title: string; 
  icon: React.ComponentType<{ className?: string }>; 
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
  color?: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  const colorClasses: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600",
    amber: "bg-amber-500/10 text-amber-600",
    blue: "bg-blue-500/10 text-blue-600",
    purple: "bg-purple-500/10 text-purple-600",
  };
  
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <span className="font-semibold text-foreground">{title}</span>
          {count !== undefined && (
            <Badge variant="secondary" className="ml-2">{count}</Badge>
          )}
        </div>
        {isOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
      </button>
      {isOpen && <div className="p-4 border-t">{children}</div>}
    </div>
  );
}

// Metric card component
function MetricCard({ label, value, change, isPositive }: { 
  label: string; 
  value: unknown; 
  change?: number;
  isPositive?: boolean;
}) {
  const Icon = getMetricIcon(label);
  const displayValue = formatMetricValue(value);
  
  // Handle nested objects
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return (
      <div className="bg-muted/30 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">{label.replace(/_/g, ' ')}</span>
        </div>
        <div className="grid gap-2">
          {Object.entries(value as Record<string, unknown>).map(([key, val]) => (
            <div key={key} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{key.replace(/_/g, ' ')}</span>
              <span className="font-medium text-foreground">{formatMetricValue(val)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-muted/30 rounded-lg p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-sm text-muted-foreground">{label.replace(/_/g, ' ')}</span>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold text-foreground">{displayValue}</span>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
            {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
    </div>
  );
}

// Insight card component
function InsightCard({ insight, index }: { insight: string; index: number }) {
  return (
    <div className="flex gap-3 p-3 bg-blue-500/5 rounded-lg border border-blue-500/10">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center">
        <span className="text-xs font-semibold text-blue-600">{index + 1}</span>
      </div>
      <p className="text-sm text-foreground leading-relaxed">{insight}</p>
    </div>
  );
}

// Recommendation card component
function RecommendationCard({ recommendation }: { recommendation: Record<string, unknown> }) {
  const priority = recommendation.priority as string || 'medium';
  const priorityColors: Record<string, { bg: string; text: string; badge: string }> = {
    high: { bg: 'bg-red-500/5', text: 'text-red-600', badge: 'bg-red-500/10 text-red-600' },
    medium: { bg: 'bg-amber-500/5', text: 'text-amber-600', badge: 'bg-amber-500/10 text-amber-600' },
    low: { bg: 'bg-blue-500/5', text: 'text-blue-600', badge: 'bg-blue-500/10 text-blue-600' },
  };
  const colors = priorityColors[priority] || priorityColors.medium;
  
  return (
    <div className={`p-4 rounded-lg border ${colors.bg}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Zap className={`h-4 w-4 ${colors.text}`} />
          <Badge className={colors.badge}>{priority} priority</Badge>
        </div>
      </div>
      <p className="text-sm font-medium text-foreground mb-2">
        {recommendation.action as string}
      </p>
      {recommendation.expected_impact && (
        <div className="flex items-start gap-2 mt-3 p-2 bg-emerald-500/5 rounded border border-emerald-500/10">
          <ArrowUpRight className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <span className="text-xs text-emerald-700 dark:text-emerald-400">
            {recommendation.expected_impact as string}
          </span>
        </div>
      )}
    </div>
  );
}

// Issue card for SEO audits
function IssueCard({ issue, severity = 'warning' }: { issue: string; severity?: string }) {
  const severityConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
    error: { icon: AlertCircle, color: 'text-red-500' },
    warning: { icon: AlertTriangle, color: 'text-amber-500' },
    info: { icon: Info, color: 'text-blue-500' },
  };
  const config = severityConfig[severity] || severityConfig.warning;
  const Icon = config.icon;
  
  return (
    <div className="flex items-start gap-2 p-2 bg-muted/50 rounded">
      <Icon className={`h-4 w-4 ${config.color} flex-shrink-0 mt-0.5`} />
      <span className="text-sm text-foreground">{issue}</span>
    </div>
  );
}

// Score display component
function ScoreDisplay({ score, label }: { score: number; label: string }) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return { text: 'text-emerald-600', bg: 'bg-emerald-500' };
    if (score >= 60) return { text: 'text-amber-600', bg: 'bg-amber-500' };
    return { text: 'text-red-600', bg: 'bg-red-500' };
  };
  const colors = getScoreColor(score);
  
  return (
    <div className="text-center p-4 bg-muted/30 rounded-lg">
      <div className={`text-3xl font-bold ${colors.text} mb-1`}>{score}</div>
      <div className="text-xs text-muted-foreground mb-2">{label}</div>
      <Progress value={score} className="h-2" />
    </div>
  );
}

// Report viewer component
function ReportViewer({ deliverable }: { deliverable: Deliverable }) {
  const { isJson, data, markdown } = parseReportContent(deliverable.description);
  
  if (!isJson && markdown) {
    // Render markdown content
    return (
      <div className="prose prose-sm max-w-none dark:prose-invert">
        {renderMarkdown(markdown)}
      </div>
    );
  }
  
  if (!data) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No report content available</p>
      </div>
    );
  }
  
  // Extract common report sections
  const metrics = data.metrics as Record<string, unknown> | undefined;
  const insights = data.insights as string[] | undefined;
  const recommendations = data.recommendations as Record<string, unknown>[] | undefined;
  const executiveSummary = data.executive_summary as string | undefined;
  const results = data.results as Record<string, unknown> | undefined;
  
  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      {executiveSummary && (
        <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg p-6 border border-primary/20">
          <div className="flex items-center gap-2 mb-3">
            <Award className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">Executive Summary</h3>
          </div>
          <p className="text-sm text-foreground leading-relaxed">{executiveSummary}</p>
        </div>
      )}
      
      {/* SEO Audit Results */}
      {results && (
        <CollapsibleSection title="Audit Results" icon={Search} color="purple">
          <div className="grid grid-cols-3 gap-4 mb-6">
            {Object.entries(results).map(([key, value]) => {
              const section = value as { score?: number; issues?: string[] };
              if (section.score !== undefined) {
                return (
                  <ScoreDisplay 
                    key={key} 
                    score={section.score} 
                    label={key.replace(/([A-Z])/g, ' $1').trim()} 
                  />
                );
              }
              return null;
            })}
          </div>
          
          {Object.entries(results).map(([key, value]) => {
            const section = value as { score?: number; issues?: string[] };
            if (section.issues && section.issues.length > 0) {
              return (
                <div key={key} className="mb-4 last:mb-0">
                  <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    {key.replace(/([A-Z])/g, ' $1').trim()} Issues
                  </h4>
                  <div className="space-y-2">
                    {section.issues.map((issue, idx) => (
                      <IssueCard key={idx} issue={issue} />
                    ))}
                  </div>
                </div>
              );
            }
            return null;
          })}
        </CollapsibleSection>
      )}
      
      {/* Metrics Section */}
      {metrics && Object.keys(metrics).length > 0 && (
        <CollapsibleSection 
          title="Key Metrics" 
          icon={BarChart3} 
          count={Object.keys(metrics).length}
          color="emerald"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(metrics).map(([key, value]) => {
              // Extract change percentage if available
              let change: number | undefined;
              let isPositive: boolean | undefined;
              
              if (typeof value === 'object' && value !== null) {
                const obj = value as Record<string, unknown>;
                if (obj.change_percentage !== undefined) {
                  change = obj.change_percentage as number;
                  isPositive = change >= 0;
                }
              }
              
              return (
                <MetricCard 
                  key={key} 
                  label={key} 
                  value={value}
                  change={change}
                  isPositive={isPositive}
                />
              );
            })}
          </div>
        </CollapsibleSection>
      )}
      
      {/* Insights Section */}
      {insights && insights.length > 0 && (
        <CollapsibleSection 
          title="Key Insights" 
          icon={Lightbulb} 
          count={insights.length}
          color="blue"
        >
          <div className="space-y-3">
            {insights.map((insight, index) => (
              <InsightCard key={index} insight={insight} index={index} />
            ))}
          </div>
        </CollapsibleSection>
      )}
      
      {/* Recommendations Section */}
      {recommendations && recommendations.length > 0 && (
        <CollapsibleSection 
          title="Recommendations" 
          icon={Target} 
          count={recommendations.length}
          color="amber"
        >
          <div className="grid gap-4">
            {recommendations.map((rec, index) => (
              <RecommendationCard key={index} recommendation={rec} />
            ))}
          </div>
        </CollapsibleSection>
      )}
      
      {/* Deliverable Created Badge */}
      {data.deliverableCreated && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
          <CheckCircle className="h-5 w-5 text-emerald-600" />
          <span className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
            This report has been finalized and delivered
          </span>
        </div>
      )}
    </div>
  );
}

// Markdown renderer for audit reports
function renderMarkdown(content: string) {
  const lines = content.split('\n');
  const elements: JSX.Element[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={key++} className="text-2xl font-bold text-foreground mt-6 mb-3 first:mt-0">
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={key++} className="text-lg font-semibold text-foreground mt-8 mb-3 pb-2 border-b border-border">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={key++} className="text-base font-medium text-foreground mt-5 mb-2">
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith('- ')) {
      elements.push(
        <li key={key++} className="text-sm text-muted-foreground ml-4 mb-1 list-disc list-inside">
          {line.slice(2)}
        </li>
      );
    } else if (line.startsWith('**') && line.includes(':**')) {
      const [label, ...rest] = line.split(':**');
      const value = rest.join(':**');
      elements.push(
        <div key={key++} className="flex gap-2 text-sm mb-2 py-1">
          <span className="font-semibold text-foreground min-w-fit">{label.replace(/\*\*/g, '')}:</span>
          <span className="text-muted-foreground">{value.replace(/\*\*/g, '')}</span>
        </div>
      );
    } else if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
      elements.push(
        <p key={key++} className="text-sm italic text-muted-foreground mb-3">
          {line.slice(1, -1)}
        </p>
      );
    } else if (line.trim()) {
      elements.push(
        <p key={key++} className="text-sm text-muted-foreground mb-2 leading-relaxed">
          {line}
        </p>
      );
    }
  }

  return elements;
}

export function ClientDeliverablesTab({ clientAccountId }: ClientDeliverablesTabProps) {
  const queryClient = useQueryClient();
  const [selectedDeliverable, setSelectedDeliverable] = useState<Deliverable | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [revisionNotes, setRevisionNotes] = useState("");

  const { data: deliverables, isLoading } = useQuery({
    queryKey: ["client-deliverables", clientAccountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliverables")
        .select("*")
        .eq("client_account_id", clientAccountId)
        .order("submitted_at", { ascending: false });

      if (error) throw error;
      return data as Deliverable[];
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, rating, feedback, revisionNotes }: { 
      id: string; 
      status: string; 
      rating?: number; 
      feedback?: string;
      revisionNotes?: string;
    }) => {
      const { error } = await supabase
        .from("deliverables")
        .update({
          status,
          rating: rating || null,
          feedback: feedback || null,
          revision_notes: status === "revision_requested" ? revisionNotes : null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-deliverables"] });
      toast({ title: "Review submitted successfully" });
      closeReviewDialog();
    },
    onError: (error) => {
      toast({ title: "Error submitting review", description: String(error), variant: "destructive" });
    },
  });

  const openReviewDialog = (deliverable: Deliverable) => {
    setSelectedDeliverable(deliverable);
    setRating(deliverable.rating || 0);
    setFeedback(deliverable.feedback || "");
    setRevisionNotes("");
    setIsReviewOpen(true);
  };

  const openReportDialog = (deliverable: Deliverable) => {
    setSelectedDeliverable(deliverable);
    setIsReportOpen(true);
  };

  const closeReviewDialog = () => {
    setIsReviewOpen(false);
    setSelectedDeliverable(null);
    setRating(0);
    setFeedback("");
    setRevisionNotes("");
  };

  const handleApprove = () => {
    if (!selectedDeliverable) return;
    reviewMutation.mutate({
      id: selectedDeliverable.id,
      status: "approved",
      rating,
      feedback,
    });
  };

  const handleRequestRevision = () => {
    if (!selectedDeliverable || !revisionNotes.trim()) {
      toast({ title: "Please describe the revisions needed", variant: "destructive" });
      return;
    }
    reviewMutation.mutate({
      id: selectedDeliverable.id,
      status: "revision_requested",
      revisionNotes,
    });
  };

  const pendingCount = deliverables?.filter(d => d.status === "pending_review").length || 0;

  // Check if deliverable has viewable content
  const hasViewableContent = (deliverable: Deliverable) => {
    if (!deliverable.description) return false;
    // Check for JSON or markdown
    try {
      JSON.parse(deliverable.description);
      return true;
    } catch {
      return deliverable.description.startsWith('# ') || 
             deliverable.description.includes('\n## ') || 
             deliverable.description.length > 100;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Deliverables</h2>
            <p className="text-muted-foreground text-sm mt-1">Review and approve your marketing assets</p>
          </div>
        </div>
        <div className="grid gap-4">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-muted rounded w-1/3 mb-4" />
                <div className="h-4 bg-muted rounded w-2/3 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Deliverables</h2>
          <p className="text-muted-foreground text-sm mt-1">Review and approve your marketing assets</p>
        </div>
        {pendingCount > 0 && (
          <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            {pendingCount} awaiting review
          </Badge>
        )}
      </div>

      {/* Empty State */}
      {!deliverables || deliverables.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Package className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No deliverables yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                When your marketing team completes work, it will appear here for your review and approval.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {deliverables.map((deliverable) => {
            const status = statusConfig[deliverable.status] || statusConfig.pending_review;
            const StatusIcon = status.icon;
            const category = categoryConfig[deliverable.category] || categoryConfig.general;
            const CategoryIcon = category.icon;
            const canView = hasViewableContent(deliverable);
            const isPending = deliverable.status === "pending_review";

            return (
              <Card 
                key={deliverable.id} 
                className={`transition-all hover:shadow-md ${isPending ? 'ring-2 ring-amber-500/20' : ''}`}
              >
                <CardContent className="p-0">
                  <div className="flex">
                    {/* Left accent stripe */}
                    <div className={`w-1.5 rounded-l-lg ${status.bgColor.replace('/10', '/40')}`} />
                    
                    <div className="flex-1 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          {/* Title row */}
                          <div className="flex items-center gap-3 mb-3">
                            <div className={`p-2 rounded-lg ${status.bgColor}`}>
                              <CategoryIcon className={`h-5 w-5 ${status.textColor}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-foreground text-lg truncate">
                                {deliverable.title}
                              </h3>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge variant="outline" className="text-xs font-normal">
                                  {category.label}
                                </Badge>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(deliverable.submitted_at), "MMM d, yyyy")}
                                </span>
                                {deliverable.revision_count > 0 && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <RotateCcw className="h-3 w-3" />
                                    v{deliverable.revision_count + 1}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Status badge */}
                          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${status.bgColor} ${status.textColor} border ${status.borderColor}`}>
                            <StatusIcon className="h-4 w-4" />
                            {status.label}
                          </div>

                          {/* Rating display */}
                          {deliverable.rating && (
                            <div className="flex items-center gap-1 mt-3">
                              <span className="text-xs text-muted-foreground mr-1">Your rating:</span>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`h-4 w-4 ${
                                    star <= deliverable.rating! 
                                      ? "fill-amber-400 text-amber-400" 
                                      : "text-muted-foreground/30"
                                  }`}
                                />
                              ))}
                            </div>
                          )}

                          {/* Feedback display */}
                          {deliverable.feedback && (
                            <p className="text-sm text-muted-foreground mt-2 italic">
                              "{deliverable.feedback}"
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col items-end gap-2">
                          {canView && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => openReportDialog(deliverable)}
                              className="gap-2"
                            >
                              <FileText className="h-4 w-4" />
                              View Report
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          )}
                          
                          <div className="flex items-center gap-2">
                            {deliverable.preview_url && (
                              <Button variant="outline" size="icon" asChild>
                                <a href={deliverable.preview_url} target="_blank" rel="noopener noreferrer">
                                  <Eye className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            {deliverable.file_url && (
                              <Button variant="outline" size="icon" asChild>
                                <a href={deliverable.file_url} download={deliverable.file_name}>
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            {isPending && (
                              <Button onClick={() => openReviewDialog(deliverable)} className="gap-2">
                                <CheckCircle2 className="h-4 w-4" />
                                Review
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Enhanced Report Viewer Dialog */}
      <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-primary/5 to-primary/10">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-xl">{selectedDeliverable?.title}</DialogTitle>
                  <DialogDescription className="flex items-center gap-2 mt-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Submitted on {selectedDeliverable && format(new Date(selectedDeliverable.submitted_at), "MMMM d, yyyy")}
                    {selectedDeliverable?.category && (
                      <>
                        <span className="text-muted-foreground">•</span>
                        <Badge variant="outline" className="text-xs">
                          {categoryConfig[selectedDeliverable.category]?.label || selectedDeliverable.category}
                        </Badge>
                      </>
                    )}
                  </DialogDescription>
                </div>
              </div>
            </div>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-180px)]">
            <div className="p-6">
              {selectedDeliverable && <ReportViewer deliverable={selectedDeliverable} />}
            </div>
          </ScrollArea>
          <div className="px-6 py-4 border-t bg-muted/30 flex justify-between items-center">
            {selectedDeliverable?.status === "pending_review" ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Ready to provide feedback on this report?
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsReportOpen(false)}>
                    Close
                  </Button>
                  <Button onClick={() => {
                    setIsReportOpen(false);
                    if (selectedDeliverable) openReviewDialog(selectedDeliverable);
                  }} className="gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Review & Approve
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {selectedDeliverable?.rating && (
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground">Your rating:</span>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-4 w-4 ${
                            star <= selectedDeliverable.rating! 
                              ? "fill-amber-400 text-amber-400" 
                              : "text-muted-foreground/30"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <Button variant="outline" onClick={() => setIsReportOpen(false)}>
                  Close
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Deliverable</DialogTitle>
            <DialogDescription>
              Approve this deliverable or request revisions
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Rating */}
            <div className="space-y-2">
              <Label>Rate this deliverable (optional)</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 hover:scale-110 transition-transform"
                  >
                    <Star
                      className={`h-8 w-8 ${
                        star <= rating 
                          ? "fill-amber-400 text-amber-400" 
                          : "text-muted-foreground/30 hover:text-amber-400/50"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Feedback */}
            <div className="space-y-2">
              <Label htmlFor="feedback">Feedback (optional)</Label>
              <Textarea
                id="feedback"
                placeholder="Share your thoughts on this deliverable..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
              />
            </div>

            <Separator />

            {/* Revision Notes */}
            <div className="space-y-2">
              <Label htmlFor="revisions" className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                Request Revisions
              </Label>
              <Textarea
                id="revisions"
                placeholder="Describe the changes you'd like to see..."
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Fill this in only if you need changes. Leave empty to approve.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeReviewDialog}>
              Cancel
            </Button>
            {revisionNotes.trim() ? (
              <Button 
                variant="secondary" 
                onClick={handleRequestRevision}
                disabled={reviewMutation.isPending}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Request Revisions
              </Button>
            ) : (
              <Button 
                onClick={handleApprove}
                disabled={reviewMutation.isPending}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
