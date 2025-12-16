import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Lightbulb,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Zap,
  ArrowUpRight,
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
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  FileText,
  Sparkles,
  Clock,
  Calendar,
} from "lucide-react";

interface Deliverable {
  id: string;
  title: string;
  description: string | null;
  category: string;
  submitted_at: string;
}

interface ReportViewerProps {
  deliverable: Deliverable;
}

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

// Make label human-readable
function humanizeLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
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
  if (lowerKey.includes('bounce')) return TrendingDown;
  return BarChart3;
}

// Section Header Component
function SectionHeader({ 
  title, 
  subtitle,
  icon: Icon,
  count
}: { 
  title: string; 
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
}) {
  return (
    <div className="flex items-start gap-4 mb-6">
      <div className="p-3 rounded-xl bg-primary/10">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          {count !== undefined && (
            <Badge variant="secondary" className="text-xs">{count} items</Badge>
          )}
        </div>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

// Summary Card for quick glance
function SummaryHighlight({ 
  label, 
  value, 
  icon: Icon,
  trend,
  isPositive
}: { 
  label: string; 
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: number;
  isPositive?: boolean;
}) {
  return (
    <div className="bg-gradient-to-br from-muted/50 to-muted/30 rounded-2xl p-5 border border-border/50">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-3xl font-bold text-foreground">{formatMetricValue(value)}</span>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            isPositive 
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
              : 'bg-red-500/10 text-red-600 dark:text-red-400'
          }`}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
    </div>
  );
}

// Metric Row Component - Simple and clean
function MetricRow({ label, value, subValue }: { label: string; value: unknown; subValue?: string }) {
  const Icon = getMetricIcon(label);
  
  // Handle nested objects
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return (
      <div className="py-4 border-b border-border/50 last:border-0">
        <div className="flex items-center gap-2 mb-3">
          <Icon className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground">{humanizeLabel(label)}</span>
        </div>
        <div className="ml-6 space-y-2">
          {Object.entries(value as Record<string, unknown>).map(([key, val]) => (
            <div key={key} className="flex justify-between py-1">
              <span className="text-sm text-muted-foreground">{humanizeLabel(key)}</span>
              <span className="text-sm font-medium text-foreground">{formatMetricValue(val)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex items-center justify-between py-4 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted/50">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <span className="text-sm font-medium text-foreground">{humanizeLabel(label)}</span>
          {subValue && (
            <p className="text-xs text-muted-foreground mt-0.5">{subValue}</p>
          )}
        </div>
      </div>
      <span className="text-lg font-semibold text-foreground">{formatMetricValue(value)}</span>
    </div>
  );
}

// Insight Card - Clean and readable
function InsightCard({ insight, index }: { insight: string; index: number }) {
  return (
    <div className="flex gap-4 p-4 bg-blue-500/5 rounded-xl border border-blue-500/10">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
        <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{index + 1}</span>
      </div>
      <p className="text-foreground leading-relaxed pt-1">{insight}</p>
    </div>
  );
}

// Recommendation Card - Action-oriented
function RecommendationCard({ recommendation, index }: { recommendation: Record<string, unknown>; index: number }) {
  const priority = (recommendation.priority as string) || 'medium';
  const priorityConfig: Record<string, { bg: string; border: string; badge: string; icon: string }> = {
    high: { 
      bg: 'bg-gradient-to-br from-red-500/5 to-red-500/10', 
      border: 'border-red-500/20',
      badge: 'bg-red-500/10 text-red-600 dark:text-red-400',
      icon: 'text-red-500'
    },
    medium: { 
      bg: 'bg-gradient-to-br from-amber-500/5 to-amber-500/10', 
      border: 'border-amber-500/20',
      badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      icon: 'text-amber-500'
    },
    low: { 
      bg: 'bg-gradient-to-br from-blue-500/5 to-blue-500/10', 
      border: 'border-blue-500/20',
      badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      icon: 'text-blue-500'
    },
  };
  const config = priorityConfig[priority] || priorityConfig.medium;
  
  return (
    <div className={`p-5 rounded-xl border ${config.bg} ${config.border}`}>
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-background flex items-center justify-center border">
          <Zap className={`h-4 w-4 ${config.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Badge className={config.badge} variant="secondary">
              {priority === 'high' ? '🔥 High Priority' : priority === 'medium' ? '⚡ Medium' : '📌 Low Priority'}
            </Badge>
          </div>
          <p className="text-foreground font-medium leading-relaxed mb-3">
            {recommendation.action as string || recommendation.title as string || 'Recommendation'}
          </p>
          {recommendation.expected_impact && (
            <div className="flex items-start gap-2 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <ArrowUpRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-emerald-700 dark:text-emerald-300">
                <strong>Expected Impact:</strong> {recommendation.expected_impact as string}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Score Display - Visual and clear
function ScoreDisplay({ score, label }: { score: number; label: string }) {
  const getScoreConfig = (score: number) => {
    if (score >= 80) return { 
      color: 'text-emerald-600 dark:text-emerald-400', 
      bg: 'bg-emerald-500',
      bgLight: 'bg-emerald-500/10',
      label: 'Excellent'
    };
    if (score >= 60) return { 
      color: 'text-amber-600 dark:text-amber-400', 
      bg: 'bg-amber-500',
      bgLight: 'bg-amber-500/10',
      label: 'Good'
    };
    return { 
      color: 'text-red-600 dark:text-red-400', 
      bg: 'bg-red-500',
      bgLight: 'bg-red-500/10',
      label: 'Needs Work'
    };
  };
  const config = getScoreConfig(score);
  
  return (
    <div className={`text-center p-5 rounded-xl ${config.bgLight} border border-border/50`}>
      <div className={`text-4xl font-bold ${config.color} mb-1`}>{score}</div>
      <div className="text-sm font-medium text-foreground mb-1">{humanizeLabel(label)}</div>
      <Badge variant="secondary" className={`${config.color} text-xs`}>{config.label}</Badge>
      <div className="mt-3">
        <Progress value={score} className="h-2" />
      </div>
    </div>
  );
}

// Issue Card - Clear severity indication
function IssueCard({ issue, severity = 'warning' }: { issue: string; severity?: string }) {
  const severityConfig: Record<string, { 
    icon: React.ComponentType<{ className?: string }>; 
    bg: string;
    border: string;
    iconColor: string;
  }> = {
    error: { 
      icon: AlertCircle, 
      bg: 'bg-red-500/5',
      border: 'border-red-500/20',
      iconColor: 'text-red-500'
    },
    warning: { 
      icon: AlertTriangle, 
      bg: 'bg-amber-500/5',
      border: 'border-amber-500/20',
      iconColor: 'text-amber-500'
    },
    info: { 
      icon: Info, 
      bg: 'bg-blue-500/5',
      border: 'border-blue-500/20',
      iconColor: 'text-blue-500'
    },
  };
  const config = severityConfig[severity] || severityConfig.warning;
  const Icon = config.icon;
  
  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border ${config.bg} ${config.border}`}>
      <Icon className={`h-5 w-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
      <span className="text-foreground leading-relaxed">{issue}</span>
    </div>
  );
}

// Collapsible Section
function CollapsibleSection({ 
  title, 
  subtitle,
  icon: Icon, 
  children, 
  defaultOpen = true,
  count,
}: { 
  title: string; 
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>; 
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border border-border/50 rounded-2xl overflow-hidden bg-card">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-foreground">{title}</span>
              {count !== undefined && (
                <Badge variant="secondary">{count}</Badge>
              )}
            </div>
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        <div className={`p-2 rounded-lg transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        </div>
      </button>
      {isOpen && (
        <div className="px-5 pb-5 border-t border-border/50">
          <div className="pt-5">{children}</div>
        </div>
      )}
    </div>
  );
}

// Markdown renderer
function renderMarkdown(content: string) {
  const lines = content.split('\n');
  const elements: JSX.Element[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={key++} className="text-3xl font-bold text-foreground mt-8 mb-4 first:mt-0">
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={key++} className="text-xl font-semibold text-foreground mt-10 mb-4 pb-3 border-b border-border">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={key++} className="text-lg font-medium text-foreground mt-6 mb-3">
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith('- ')) {
      elements.push(
        <div key={key++} className="flex items-start gap-3 mb-2 ml-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2.5 flex-shrink-0" />
          <span className="text-foreground leading-relaxed">{line.slice(2)}</span>
        </div>
      );
    } else if (line.startsWith('**') && line.includes(':**')) {
      const [label, ...rest] = line.split(':**');
      const value = rest.join(':**');
      elements.push(
        <div key={key++} className="flex gap-2 mb-3 py-2 px-3 bg-muted/30 rounded-lg">
          <span className="font-semibold text-foreground">{label.replace(/\*\*/g, '')}:</span>
          <span className="text-muted-foreground">{value.replace(/\*\*/g, '')}</span>
        </div>
      );
    } else if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
      elements.push(
        <p key={key++} className="text-muted-foreground italic mb-4 pl-4 border-l-2 border-primary/30">
          {line.slice(1, -1)}
        </p>
      );
    } else if (line.trim()) {
      elements.push(
        <p key={key++} className="text-foreground mb-3 leading-relaxed">
          {line}
        </p>
      );
    }
  }

  return elements;
}

export function ReportViewer({ deliverable }: ReportViewerProps) {
  const { isJson, data, markdown } = parseReportContent(deliverable.description);
  
  if (!isJson && markdown) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="prose prose-lg max-w-none dark:prose-invert">
          {renderMarkdown(markdown)}
        </div>
      </div>
    );
  }
  
  if (!data) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">No Report Content</h3>
        <p className="text-muted-foreground">This report doesn't have any content to display.</p>
      </div>
    );
  }
  
  // Extract common report sections
  const metrics = data.metrics as Record<string, unknown> | undefined;
  const insights = data.insights as string[] | undefined;
  const recommendations = data.recommendations as Record<string, unknown>[] | undefined;
  const executiveSummary = data.executive_summary as string | undefined;
  const results = data.results as Record<string, unknown> | undefined;
  
  // Extract key metrics for summary
  const keyMetrics = metrics ? Object.entries(metrics).slice(0, 4) : [];
  
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Report Header */}
      <div className="text-center pb-6 border-b border-border">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-4">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary">Marketing Report</span>
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">{deliverable.title}</h1>
        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {new Date(deliverable.submitted_at).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </div>
        </div>
      </div>

      {/* Executive Summary - Always visible first */}
      {executiveSummary && (
        <div className="bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 rounded-2xl p-8 border border-primary/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/20">
              <Award className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Executive Summary</h2>
          </div>
          <p className="text-lg text-foreground leading-relaxed">{executiveSummary}</p>
        </div>
      )}

      {/* Quick Stats - At a glance */}
      {keyMetrics.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">At a Glance</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {keyMetrics.map(([key, value]) => {
              const Icon = getMetricIcon(key);
              const simpleValue = typeof value === 'object' && value !== null 
                ? (value as Record<string, unknown>).current || (value as Record<string, unknown>).value || Object.values(value)[0]
                : value;
              
              return (
                <SummaryHighlight
                  key={key}
                  label={humanizeLabel(key)}
                  value={simpleValue as string | number}
                  icon={Icon}
                />
              );
            })}
          </div>
        </div>
      )}
      
      {/* SEO Audit Results */}
      {results && (
        <CollapsibleSection 
          title="Audit Results" 
          subtitle="Detailed analysis of your website performance"
          icon={Search}
        >
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            {Object.entries(results).map(([key, value]) => {
              const section = value as { score?: number; issues?: string[] };
              if (section.score !== undefined) {
                return (
                  <ScoreDisplay 
                    key={key} 
                    score={section.score} 
                    label={key} 
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
                <div key={key} className="mb-6 last:mb-0">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    <h4 className="font-semibold text-foreground">{humanizeLabel(key)} - Items to Address</h4>
                    <Badge variant="secondary">{section.issues.length}</Badge>
                  </div>
                  <div className="space-y-3">
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
      
      {/* All Metrics */}
      {metrics && Object.keys(metrics).length > 4 && (
        <CollapsibleSection 
          title="All Metrics" 
          subtitle="Complete breakdown of your performance data"
          icon={BarChart3}
          count={Object.keys(metrics).length}
          defaultOpen={false}
        >
          <div className="divide-y divide-border/50">
            {Object.entries(metrics).map(([key, value]) => (
              <MetricRow key={key} label={key} value={value} />
            ))}
          </div>
        </CollapsibleSection>
      )}
      
      {/* Insights */}
      {insights && insights.length > 0 && (
        <CollapsibleSection 
          title="Key Insights" 
          subtitle="Important findings from your data"
          icon={Lightbulb}
          count={insights.length}
        >
          <div className="space-y-4">
            {insights.map((insight, index) => (
              <InsightCard key={index} insight={insight} index={index} />
            ))}
          </div>
        </CollapsibleSection>
      )}
      
      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <CollapsibleSection 
          title="Recommended Actions" 
          subtitle="Steps to improve your marketing performance"
          icon={Target}
          count={recommendations.length}
        >
          <div className="space-y-4">
            {recommendations.map((rec, index) => (
              <RecommendationCard key={index} recommendation={rec} index={index} />
            ))}
          </div>
        </CollapsibleSection>
      )}
      
      {/* Deliverable Status */}
      {data.deliverableCreated && (
        <div className="flex items-center gap-3 p-5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
          <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          <div>
            <span className="font-medium text-emerald-700 dark:text-emerald-300">
              Report Finalized
            </span>
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              This report has been completed and delivered to you.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
