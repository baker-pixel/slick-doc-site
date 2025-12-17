import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";
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
  FileText,
  Sparkles,
  Calendar,
  Rocket,
  TrendingUpIcon,
  Star,
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

// Animated counter for numbers
function AnimatedNumber({ value }: { value: number | string }) {
  const numValue = typeof value === 'number' ? value : parseFloat(value) || 0;
  return <span>{formatMetricValue(numValue)}</span>;
}

// Summary Card for quick glance - Modern glass style
function SummaryHighlight({ 
  label, 
  value, 
  icon: Icon,
  trend,
  isPositive,
  index
}: { 
  label: string; 
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: number;
  isPositive?: boolean;
  index: number;
}) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-card via-card to-muted/30 border border-border/50 p-6 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
    >
      {/* Decorative gradient blob */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
      
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 ring-1 ring-primary/20">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          {trend !== undefined && (
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
              isPositive 
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20' 
                : 'bg-red-500/15 text-red-600 dark:text-red-400 ring-1 ring-red-500/20'
            }`}>
              {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(trend)}%
            </div>
          )}
        </div>
        <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
        <p className="text-3xl font-bold text-foreground tracking-tight">
          <AnimatedNumber value={value} />
        </p>
      </div>
    </motion.div>
  );
}

// Metric Row Component - Clean and modern
function MetricRow({ label, value, subValue, index }: { label: string; value: unknown; subValue?: string; index: number }) {
  const Icon = getMetricIcon(label);
  
  // Handle nested objects
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return (
      <motion.div 
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        className="py-5 border-b border-border/30 last:border-0"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold text-foreground">{humanizeLabel(label)}</span>
        </div>
        <div className="ml-10 grid gap-2 bg-muted/30 rounded-xl p-4">
          {Object.entries(value as Record<string, unknown>).map(([key, val]) => (
            <div key={key} className="flex justify-between py-1.5">
              <span className="text-sm text-muted-foreground">{humanizeLabel(key)}</span>
              <span className="text-sm font-semibold text-foreground">{formatMetricValue(val)}</span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }
  
  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="flex items-center justify-between py-5 border-b border-border/30 last:border-0 group"
    >
      <div className="flex items-center gap-4">
        <div className="p-2.5 rounded-xl bg-muted/50 group-hover:bg-primary/10 transition-colors">
          <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        <div>
          <span className="font-medium text-foreground">{humanizeLabel(label)}</span>
          {subValue && (
            <p className="text-xs text-muted-foreground mt-0.5">{subValue}</p>
          )}
        </div>
      </div>
      <span className="text-xl font-bold text-foreground tabular-nums">{formatMetricValue(value)}</span>
    </motion.div>
  );
}

// Insight Card - Modern and clean
function InsightCard({ insight, index }: { insight: string; index: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
      className="flex gap-4 p-5 bg-gradient-to-br from-blue-500/5 via-blue-500/10 to-indigo-500/5 rounded-2xl border border-blue-500/10 hover:border-blue-500/20 transition-colors"
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
        <span className="text-sm font-bold text-white">{index + 1}</span>
      </div>
      <p className="text-foreground leading-relaxed pt-2 flex-1">{parseInlineMarkdown(insight)}</p>
    </motion.div>
  );
}

// Recommendation Card - Action-oriented with priority styling
function RecommendationCard({ recommendation, index }: { recommendation: Record<string, unknown>; index: number }) {
  const priority = (recommendation.priority as string) || 'medium';
  const priorityConfig: Record<string, { 
    gradient: string; 
    border: string; 
    badge: string;
    icon: string;
    glow: string;
  }> = {
    high: { 
      gradient: 'from-red-500/5 via-orange-500/10 to-red-500/5', 
      border: 'border-red-500/20 hover:border-red-500/40',
      badge: 'bg-gradient-to-r from-red-500 to-orange-500 text-white',
      icon: 'from-red-500 to-orange-500',
      glow: 'shadow-red-500/10'
    },
    medium: { 
      gradient: 'from-amber-500/5 via-yellow-500/10 to-amber-500/5', 
      border: 'border-amber-500/20 hover:border-amber-500/40',
      badge: 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white',
      icon: 'from-amber-500 to-yellow-500',
      glow: 'shadow-amber-500/10'
    },
    low: { 
      gradient: 'from-blue-500/5 via-cyan-500/10 to-blue-500/5', 
      border: 'border-blue-500/20 hover:border-blue-500/40',
      badge: 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white',
      icon: 'from-blue-500 to-cyan-500',
      glow: 'shadow-blue-500/10'
    },
  };
  const config = priorityConfig[priority] || priorityConfig.medium;
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
      className={`p-6 rounded-2xl border bg-gradient-to-br ${config.gradient} ${config.border} transition-all duration-300 hover:shadow-lg ${config.glow}`}
    >
      <div className="flex items-start gap-4">
        <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${config.icon} flex items-center justify-center shadow-lg`}>
          <Zap className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <Badge className={`${config.badge} px-3 py-1 text-xs font-semibold border-0`}>
              {priority === 'high' ? '🔥 High Priority' : priority === 'medium' ? '⚡ Medium Priority' : '📌 Low Priority'}
            </Badge>
          </div>
          <p className="text-foreground font-medium leading-relaxed text-lg mb-4">
            {parseInlineMarkdown((recommendation.action as string) || (recommendation.title as string) || 'Recommendation')}
          </p>
          {recommendation.expected_impact && (
            <div className="flex items-start gap-3 p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <div className="p-1.5 rounded-lg bg-emerald-500/20">
                <ArrowUpRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-0.5">Expected Impact</p>
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  {recommendation.expected_impact as string}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Score Display - Visual gauge style
function ScoreDisplay({ score, label, index }: { score: number; label: string; index: number }) {
  const getScoreConfig = (score: number) => {
    if (score >= 80) return { 
      gradient: 'from-emerald-500 to-green-400', 
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-600 dark:text-emerald-400',
      label: 'Excellent',
      ring: 'ring-emerald-500/30'
    };
    if (score >= 60) return { 
      gradient: 'from-amber-500 to-yellow-400', 
      bg: 'bg-amber-500/10',
      text: 'text-amber-600 dark:text-amber-400',
      label: 'Good',
      ring: 'ring-amber-500/30'
    };
    return { 
      gradient: 'from-red-500 to-orange-400', 
      bg: 'bg-red-500/10',
      text: 'text-red-600 dark:text-red-400',
      label: 'Needs Work',
      ring: 'ring-red-500/30'
    };
  };
  const config = getScoreConfig(score);
  
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className={`relative text-center p-6 rounded-2xl ${config.bg} ring-1 ${config.ring} overflow-hidden`}
    >
      {/* Decorative elements */}
      <div className={`absolute inset-0 bg-gradient-to-br ${config.gradient} opacity-5`} />
      
      <div className="relative">
        <div className={`text-5xl font-black ${config.text} mb-2 tracking-tight`}>
          {score}
        </div>
        <div className="text-sm font-semibold text-foreground mb-1">{humanizeLabel(label)}</div>
        <Badge variant="secondary" className={`${config.text} ${config.bg} text-xs font-medium`}>
          {config.label}
        </Badge>
        <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 0.8, delay: 0.2 + index * 0.1 }}
            className={`h-full rounded-full bg-gradient-to-r ${config.gradient}`}
          />
        </div>
      </div>
    </motion.div>
  );
}

// Issue Card - Clear severity indication
function IssueCard({ issue, severity = 'warning', index }: { issue: string; severity?: string; index: number }) {
  const severityConfig: Record<string, { 
    icon: React.ComponentType<{ className?: string }>; 
    bg: string;
    border: string;
    iconBg: string;
    iconColor: string;
  }> = {
    error: { 
      icon: AlertCircle, 
      bg: 'bg-red-500/5',
      border: 'border-red-500/20',
      iconBg: 'bg-red-500/10',
      iconColor: 'text-red-500'
    },
    warning: { 
      icon: AlertTriangle, 
      bg: 'bg-amber-500/5',
      border: 'border-amber-500/20',
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-500'
    },
    info: { 
      icon: Info, 
      bg: 'bg-blue-500/5',
      border: 'border-blue-500/20',
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-500'
    },
  };
  const config = severityConfig[severity] || severityConfig.warning;
  const Icon = config.icon;
  
  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={`flex items-start gap-4 p-4 rounded-xl border ${config.bg} ${config.border}`}
    >
      <div className={`p-2 rounded-lg ${config.iconBg}`}>
        <Icon className={`h-4 w-4 ${config.iconColor}`} />
      </div>
      <span className="text-foreground leading-relaxed pt-0.5">{parseInlineMarkdown(issue)}</span>
    </motion.div>
  );
}

// Collapsible Section - Modern accordion style
function CollapsibleSection({ 
  title, 
  subtitle,
  icon: Icon, 
  children, 
  defaultOpen = true,
  count,
  accentColor = 'primary'
}: { 
  title: string; 
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>; 
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
  accentColor?: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  const accentColors: Record<string, string> = {
    primary: 'from-primary/20 to-primary/10',
    emerald: 'from-emerald-500/20 to-emerald-500/10',
    blue: 'from-blue-500/20 to-blue-500/10',
    amber: 'from-amber-500/20 to-amber-500/10',
    purple: 'from-purple-500/20 to-purple-500/10',
  };
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-border/50 rounded-2xl overflow-hidden bg-card shadow-sm"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-6 hover:bg-muted/30 transition-all duration-200"
      >
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl bg-gradient-to-br ${accentColors[accentColor]} ring-1 ring-border/50`}>
            <Icon className="h-5 w-5 text-foreground" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold text-foreground">{title}</span>
              {count !== undefined && (
                <Badge variant="secondary" className="text-xs">{count}</Badge>
              )}
            </div>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        <motion.div 
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
        >
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-6 pb-6 border-t border-border/50">
              <div className="pt-6">{children}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Parse inline markdown (bold, italic) within text
function parseInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Remove simple bracket wrappers like [Your Website Link]
  let remaining = text.replace(/\[([^\]]+)\]/g, '$1');
  let keyIndex = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/(?<!\*)\*([^*]+)\*(?!\*)/);

    let nextMatch: { index: number; length: number; content: string; type: 'bold' | 'italic' } | null = null;

    if (boldMatch && boldMatch.index !== undefined) {
      nextMatch = { index: boldMatch.index, length: boldMatch[0].length, content: boldMatch[1], type: 'bold' };
    }
    if (italicMatch && italicMatch.index !== undefined) {
      if (!nextMatch || italicMatch.index < nextMatch.index) {
        nextMatch = { index: italicMatch.index, length: italicMatch[0].length, content: italicMatch[1], type: 'italic' };
      }
    }

    if (nextMatch) {
      if (nextMatch.index > 0) {
        parts.push(remaining.slice(0, nextMatch.index));
      }
      if (nextMatch.type === 'bold') {
        parts.push(
          <strong key={keyIndex++} className="font-semibold text-foreground">
            {nextMatch.content}
          </strong>
        );
      } else {
        parts.push(
          <em key={keyIndex++} className="italic text-muted-foreground">
            {nextMatch.content}
          </em>
        );
      }
      remaining = remaining.slice(nextMatch.index + nextMatch.length);
    } else {
      // Strip any leftover * markers so they never display literally
      parts.push(remaining.replace(/\*\*/g, '').replace(/\*/g, ''));
      break;
    }
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// Markdown renderer with modern styling
function renderMarkdown(content: string) {
  const lines = content.split('\n');
  const elements: JSX.Element[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={key++} className="text-3xl font-bold text-foreground mt-10 mb-5 first:mt-0 tracking-tight">
          {parseInlineMarkdown(line.slice(2))}
        </h1>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={key++} className="text-2xl font-semibold text-foreground mt-12 mb-4 pb-3 border-b border-border/50">
          {parseInlineMarkdown(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={key++} className="text-xl font-medium text-foreground mt-8 mb-3">
          {parseInlineMarkdown(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      // Handle both dash and asterisk bullet points
      elements.push(
        <div key={key++} className="flex items-start gap-3 mb-3 ml-2">
          <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary to-primary/50 mt-2.5 flex-shrink-0" />
          <span className="text-foreground leading-relaxed">{parseInlineMarkdown(line.slice(2))}</span>
        </div>
      );
    } else if (line.startsWith('**') && line.includes(':**')) {
      const [label, ...rest] = line.split(':**');
      const value = rest.join(':**');
      elements.push(
        <div key={key++} className="flex gap-3 mb-3 py-3 px-4 bg-muted/30 rounded-xl">
          <span className="font-semibold text-foreground">{label.replace(/\*\*/g, '')}:</span>
          <span className="text-muted-foreground">{parseInlineMarkdown(value.replace(/\*\*/g, ''))}</span>
        </div>
      );
    } else if (line.trim()) {
      elements.push(
        <p key={key++} className="text-foreground mb-4 leading-relaxed text-lg">
          {parseInlineMarkdown(line)}
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
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="prose prose-lg max-w-none dark:prose-invert"
        >
          {renderMarkdown(markdown)}
        </motion.div>
      </div>
    );
  }
  
  if (!data) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-20"
      >
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-muted/50 flex items-center justify-center">
          <FileText className="h-10 w-10 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">No Report Content</h3>
        <p className="text-muted-foreground">This report doesn't have any content to display yet.</p>
      </motion.div>
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
    <div className="max-w-4xl mx-auto space-y-10">
      {/* Report Header - Modern hero style */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center pb-8 relative"
      >
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent rounded-full blur-3xl" />
        </div>
        
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary/10 via-primary/20 to-primary/10 rounded-full border border-primary/20 mb-6"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-primary">Marketing Report</span>
        </motion.div>
        
        <h1 className="text-4xl font-bold text-foreground mb-4 tracking-tight">{deliverable.title}</h1>
        
        <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {new Date(deliverable.submitted_at).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </div>
        </div>
      </motion.div>

      {/* Executive Summary - Premium card style */}
      {executiveSummary && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 p-8 border border-primary/20"
        >
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-primary/20 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-primary/10 to-transparent rounded-full blur-2xl" />
          
          <div className="relative">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/20">
                <Award className="h-6 w-6 text-primary-foreground" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Executive Summary</h2>
            </div>
            <p className="text-lg text-foreground leading-relaxed">{parseInlineMarkdown(executiveSummary)}</p>
          </div>
        </motion.div>
      )}

      {/* Quick Stats - At a glance grid */}
      {keyMetrics.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Key Performance Metrics</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {keyMetrics.map(([key, value], index) => {
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
                  index={index}
                />
              );
            })}
          </div>
        </div>
      )}
      
      {/* SEO Audit Results */}
      {results && (
        <CollapsibleSection 
          title="Performance Scores" 
          subtitle="How your website is performing across key areas"
          icon={Search}
          accentColor="purple"
        >
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            {Object.entries(results).map(([key, value], index) => {
              const section = value as { score?: number; issues?: string[] };
              if (section.score !== undefined) {
                return (
                  <ScoreDisplay 
                    key={key} 
                    score={section.score} 
                    label={key}
                    index={index}
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
                <div key={key} className="mb-8 last:mb-0">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-amber-500/10">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                    </div>
                    <h4 className="font-semibold text-foreground text-lg">{humanizeLabel(key)} - Items to Address</h4>
                    <Badge variant="secondary">{section.issues.length}</Badge>
                  </div>
                  <div className="space-y-3">
                    {section.issues.map((issue, idx) => (
                      <IssueCard key={idx} issue={issue} index={idx} />
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
          title="Complete Metrics Breakdown" 
          subtitle="Detailed view of all your performance data"
          icon={BarChart3}
          count={Object.keys(metrics).length}
          defaultOpen={false}
          accentColor="emerald"
        >
          <div className="divide-y divide-border/30">
            {Object.entries(metrics).map(([key, value], index) => (
              <MetricRow key={key} label={key} value={value} index={index} />
            ))}
          </div>
        </CollapsibleSection>
      )}
      
      {/* Insights */}
      {insights && insights.length > 0 && (
        <CollapsibleSection 
          title="Key Insights" 
          subtitle="Important findings and observations from your data"
          icon={Lightbulb}
          count={insights.length}
          accentColor="blue"
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
          subtitle="Strategic steps to improve your marketing performance"
          icon={Target}
          count={recommendations.length}
          accentColor="amber"
        >
          <div className="space-y-4">
            {recommendations.map((rec, index) => (
              <RecommendationCard key={index} recommendation={rec} index={index} />
            ))}
          </div>
        </CollapsibleSection>
      )}
      
      {/* Report Status Footer */}
      {data.deliverableCreated && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 p-6 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-green-500/10 rounded-2xl border border-emerald-500/20"
        >
          <div className="p-3 rounded-xl bg-emerald-500/20">
            <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="font-semibold text-emerald-700 dark:text-emerald-300 text-lg">
              Report Complete
            </p>
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              This report has been finalized and delivered to your account.
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
