import { ReactNode, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { 
  ChevronDown, 
  LucideIcon,
  TrendingUp,
  TrendingDown,
  Sparkles,
  ArrowRight,
} from "lucide-react";

// Animation variants for consistent animations
export const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 }
};

export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

// Page Header Component
interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  badge?: string;
  action?: ReactNode;
  gradient?: boolean;
}

export function PageHeader({ title, description, icon: Icon, badge, action, gradient = true }: PageHeaderProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8"
    >
      <div className="flex items-start gap-4">
        {Icon && (
          <div className={cn(
            "p-3 rounded-2xl shadow-lg",
            gradient 
              ? "bg-gradient-to-br from-primary to-primary/80 shadow-primary/20" 
              : "bg-primary/10"
          )}>
            <Icon className={cn("h-6 w-6", gradient ? "text-primary-foreground" : "text-primary")} />
          </div>
        )}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{title}</h1>
            {badge && (
              <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
                {badge}
              </Badge>
            )}
          </div>
          {description && (
            <p className="text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      </div>
      {action && <div>{action}</div>}
    </motion.div>
  );
}

// Stat Card Component
interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: number;
  trendLabel?: string;
  className?: string;
  index?: number;
}

export function StatCard({ label, value, icon: Icon, trend, trendLabel, className, index = 0 }: StatCardProps) {
  const isPositive = trend !== undefined && trend >= 0;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className={cn(
        "group relative overflow-hidden rounded-2xl bg-card border border-border/50 p-6",
        "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300",
        className
      )}
    >
      {/* Decorative gradient */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          {Icon && (
            <div className="p-2.5 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Icon className="h-5 w-5 text-primary" />
            </div>
          )}
          {trend !== undefined && (
            <div className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold",
              isPositive 
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                : "bg-red-500/10 text-red-600 dark:text-red-400"
            )}>
              {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(trend)}%
            </div>
          )}
        </div>
        <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
        <p className="text-3xl font-bold text-foreground tracking-tight">{value}</p>
        {trendLabel && (
          <p className="text-xs text-muted-foreground mt-2">{trendLabel}</p>
        )}
      </div>
    </motion.div>
  );
}

// Modern Card Component
interface ModernCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  gradient?: boolean;
}

export function ModernCard({ children, className, hover = true, padding = "md", gradient = false }: ModernCardProps) {
  const paddingClasses = {
    none: "",
    sm: "p-4",
    md: "p-6",
    lg: "p-8"
  };
  
  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl bg-card border border-border/50",
      hover && "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300",
      gradient && "bg-gradient-to-br from-card via-card to-muted/30",
      paddingClasses[padding],
      className
    )}>
      {children}
    </div>
  );
}

// Section Header Component
interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  count?: number;
}

export function SectionHeader({ title, subtitle, icon: Icon, action, count }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="p-2 rounded-xl bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            {count !== undefined && (
              <Badge variant="secondary" className="text-xs">{count}</Badge>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

// Collapsible Section Component
interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  children: ReactNode;
  defaultOpen?: boolean;
  count?: number;
  accentColor?: "primary" | "emerald" | "blue" | "amber" | "purple";
}

export function CollapsibleSection({ 
  title, 
  subtitle,
  icon: Icon, 
  children, 
  defaultOpen = true,
  count,
  accentColor = "primary"
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  const accentColors = {
    primary: "from-primary/20 to-primary/10",
    emerald: "from-emerald-500/20 to-emerald-500/10",
    blue: "from-blue-500/20 to-blue-500/10",
    amber: "from-amber-500/20 to-amber-500/10",
    purple: "from-purple-500/20 to-purple-500/10",
  };
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-border/50 rounded-2xl overflow-hidden bg-card"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 hover:bg-muted/30 transition-all duration-200"
      >
        <div className="flex items-center gap-4">
          {Icon && (
            <div className={cn("p-3 rounded-xl bg-gradient-to-br ring-1 ring-border/50", accentColors[accentColor])}>
              <Icon className="h-5 w-5 text-foreground" />
            </div>
          )}
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
            <div className="px-5 pb-5 border-t border-border/50">
              <div className="pt-5">{children}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Empty State Component
interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-16 px-4 text-center"
    >
      {Icon && (
        <div className="w-16 h-16 mb-6 rounded-2xl bg-muted/50 flex items-center justify-center">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      {description && (
        <p className="text-muted-foreground max-w-sm mb-6">{description}</p>
      )}
      {action}
    </motion.div>
  );
}

// List Item Component
interface ListItemProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  badge?: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
  index?: number;
}

export function ListItem({ title, subtitle, icon: Icon, iconColor, badge, action, onClick, index = 0 }: ListItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl transition-all duration-200",
        onClick && "cursor-pointer hover:bg-muted/50"
      )}
    >
      {Icon && (
        <div className={cn("p-2.5 rounded-xl", iconColor || "bg-primary/10")}>
          <Icon className="h-5 w-5 text-primary" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{title}</p>
        {subtitle && (
          <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
        )}
      </div>
      {badge}
      {action}
    </motion.div>
  );
}

// Feature Card Component
interface FeatureCardProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  gradient?: string;
  onClick?: () => void;
  index?: number;
}

export function FeatureCard({ title, description, icon: Icon, gradient, onClick, index = 0 }: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-2xl p-6 cursor-pointer",
        "bg-gradient-to-br border border-border/50",
        gradient || "from-primary/5 via-primary/10 to-primary/5",
        "hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300"
      )}
    >
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/20 to-transparent rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <div className="relative">
        {Icon && (
          <div className="w-12 h-12 mb-4 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
            <Icon className="h-6 w-6 text-primary-foreground" />
          </div>
        )}
        <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{description}</p>
        <div className="flex items-center gap-2 text-primary font-medium text-sm group-hover:gap-3 transition-all">
          <span>Learn more</span>
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </motion.div>
  );
}

// Status Badge Component
interface StatusBadgeProps {
  status: string;
  variant?: "default" | "success" | "warning" | "error" | "info";
}

export function StatusBadge({ status, variant = "default" }: StatusBadgeProps) {
  const variants = {
    default: "bg-muted text-muted-foreground",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20",
    error: "bg-red-500/10 text-red-600 dark:text-red-400 ring-1 ring-red-500/20",
    info: "bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20",
  };
  
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold",
      variants[variant]
    )}>
      {status}
    </span>
  );
}

// Skeleton loader for cards
export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-muted/50 animate-pulse h-24" />
      ))}
    </div>
  );
}

// Grid Skeleton
export function GridSkeleton({ count = 4, cols = 4 }: { count?: number; cols?: number }) {
  return (
    <div className={cn("grid gap-4", `grid-cols-1 sm:grid-cols-2 lg:grid-cols-${cols}`)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-muted/50 animate-pulse h-32" />
      ))}
    </div>
  );
}

// Gradient Text
export function GradientText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn(
      "bg-gradient-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent",
      className
    )}>
      {children}
    </span>
  );
}

// Animated Counter
export function AnimatedCounter({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="tabular-nums"
    >
      {prefix}{value.toLocaleString()}{suffix}
    </motion.span>
  );
}
