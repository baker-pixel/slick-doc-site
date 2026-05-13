import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AuditIssue {
  issue: string;
  affected_pages: string[];
  impact: string;
}

interface SeverityIssueListProps {
  errors:   AuditIssue[];
  warnings: AuditIssue[];
  notices:  AuditIssue[];
  className?: string;
}

interface SectionProps {
  label:   string;
  count:   number;
  issues:  AuditIssue[];
  variant: "error" | "warning" | "notice";
}

function IssueSection({ label, count, issues, variant }: SectionProps) {
  const [open, setOpen]         = useState(variant === "error");
  const [expanded, setExpanded] = useState<number | null>(null);

  if (count === 0) return null;

  const colors = {
    error:   { row: "border-red-200 bg-red-50",   badge: "bg-red-100 text-red-700 border-red-200",   icon: <AlertCircle className="h-4 w-4 text-red-500" />,   header: "text-red-700 bg-red-50 hover:bg-red-100 border-red-200" },
    warning: { row: "border-amber-200 bg-amber-50", badge: "bg-amber-100 text-amber-700 border-amber-200", icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, header: "text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200" },
    notice:  { row: "border-blue-100 bg-blue-50",  badge: "bg-blue-100 text-blue-700 border-blue-200",  icon: <Info className="h-4 w-4 text-blue-400" />,          header: "text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200" },
  }[variant];

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Section header */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn("w-full flex items-center justify-between px-4 py-3 border-b font-medium text-sm transition-colors", colors.header)}
      >
        <div className="flex items-center gap-2">
          {colors.icon}
          <span>{label}</span>
          <Badge variant="outline" className={cn("text-xs font-bold", colors.badge)}>{count}</Badge>
        </div>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {/* Issues */}
      {open && (
        <div className="divide-y">
          {issues.map((issue, i) => (
            <div key={i} className={cn("px-4 py-3 text-sm", colors.row)}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">{issue.issue}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{issue.impact}</p>
                </div>
                {issue.affected_pages.length > 0 && (
                  <Button
                    variant="ghost" size="sm"
                    className="text-xs h-auto py-0.5 px-2 shrink-0"
                    onClick={() => setExpanded(expanded === i ? null : i)}
                  >
                    {issue.affected_pages.length} page{issue.affected_pages.length !== 1 ? "s" : ""}
                    {expanded === i ? <ChevronDown className="ml-1 h-3 w-3" /> : <ChevronRight className="ml-1 h-3 w-3" />}
                  </Button>
                )}
              </div>
              {expanded === i && issue.affected_pages.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground bg-white/60 rounded p-2">
                  {issue.affected_pages.slice(0, 10).map((p, j) => (
                    <li key={j} className="truncate">
                      <a href={p} target="_blank" rel="noopener noreferrer"
                        className="hover:underline text-blue-600 font-mono">
                        {p}
                      </a>
                    </li>
                  ))}
                  {issue.affected_pages.length > 10 && (
                    <li className="text-gray-400">…and {issue.affected_pages.length - 10} more</li>
                  )}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SeverityIssueList({ errors, warnings, notices, className }: SeverityIssueListProps) {
  const total = errors.length + warnings.length + notices.length;
  if (total === 0) return null;
  return (
    <div className={cn("space-y-2", className)}>
      <IssueSection label="Errors"   count={errors.length}   issues={errors}   variant="error"   />
      <IssueSection label="Warnings" count={warnings.length} issues={warnings} variant="warning" />
      <IssueSection label="Notices"  count={notices.length}  issues={notices}  variant="notice"  />
    </div>
  );
}
