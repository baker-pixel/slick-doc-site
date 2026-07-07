import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Wand2, CheckCircle2, Copy, AlertCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { friendlyEdgeMessage, getEdgeErrorMessage } from "@/lib/edge-error";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export interface AiFixCardProps {
  clientAccountId: string;
  source: "seo" | "content" | "ads" | "email" | "qa";
  sourceReferenceId?: string;
  issueTitle: string;
  issueSummary?: string;
  severity?: "low" | "medium" | "high" | "critical";
  context?: Record<string, unknown>;
  compact?: boolean;
}

interface FixRecord {
  id: string;
  status: string;
  fix_plan: { explanation?: string; impact?: string; steps?: string[]; manual_fallback?: string };
  ready_to_apply: { type?: string; payload?: { value?: string } } | null;
  apply_target: string | null;
  error_message?: string | null;
}

const severityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  critical: "bg-destructive/15 text-destructive",
};

export const AiFixCard = ({
  clientAccountId,
  source,
  sourceReferenceId,
  issueTitle,
  issueSummary,
  severity = "medium",
  context,
  compact = false,
}: AiFixCardProps) => {
  const { adminPassword } = useAdminAuth();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [fix, setFix] = useState<FixRecord | null>(null);
  const [expanded, setExpanded] = useState(!compact);
  const [canAutoApply, setCanAutoApply] = useState(false);

  const generateFix = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-fix-plan", {
        body: {
          client_account_id: clientAccountId,
          source,
          source_reference_id: sourceReferenceId,
          issue_title: issueTitle,
          issue_summary: issueSummary,
          severity,
          context,
          password: adminPassword,
        },
      });
      const errMsg = await getEdgeErrorMessage(error, data);
      if (errMsg) throw new Error(errMsg);
      setFix(data.fix);
      setCanAutoApply(!!data.can_auto_apply);
      setExpanded(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to generate fix";
      toast({ title: "Couldn't generate fix", description: friendlyEdgeMessage(msg), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const applyToWordPress = async () => {
    if (!fix) return;
    setApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke("apply-fix-to-wordpress", {
        body: { fix_id: fix.id },
      });
      const errMsg = await getEdgeErrorMessage(error, data);
      if (errMsg) throw new Error(errMsg);
      setFix({ ...fix, status: "applied" });
      toast({ title: "Published to WordPress", description: "The fix has been applied to the live site." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to apply fix";
      toast({ title: "Couldn't publish", description: friendlyEdgeMessage(msg), variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const copyFix = () => {
    const value = fix?.ready_to_apply?.payload?.value;
    if (!value) return;
    navigator.clipboard.writeText(value);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <Card className="border-l-4 border-l-primary/60">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={severityColors[severity]}>{severity}</Badge>
              {fix?.status === "applied" && (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Applied
                </Badge>
              )}
              {fix?.status === "failed" && (
                <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" /> Failed</Badge>
              )}
            </div>
            <p className="font-medium text-sm mt-1.5">{issueTitle}</p>
            {issueSummary && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{issueSummary}</p>}
          </div>
          {!fix && (
            <Button size="sm" onClick={generateFix} disabled={loading} className="shrink-0">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "Thinking…" : "Explain & Fix"}
            </Button>
          )}
          {fix && compact && (
            <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </div>

        {fix && expanded && (
          <div className="space-y-3 pt-2 border-t">
            {fix.fix_plan.explanation && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">What & why</p>
                <p className="text-sm">{fix.fix_plan.explanation}</p>
              </div>
            )}
            {fix.fix_plan.impact && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Impact</p>
                <p className="text-sm">{fix.fix_plan.impact}</p>
              </div>
            )}
            {fix.fix_plan.steps && fix.fix_plan.steps.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Fix steps</p>
                <ol className="text-sm space-y-1 list-decimal list-inside">
                  {fix.fix_plan.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            )}
            {fix.ready_to_apply?.payload?.value && (
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Ready-to-use fix</p>
                <p className="text-sm font-mono whitespace-pre-wrap break-words">{fix.ready_to_apply.payload.value}</p>
              </div>
            )}
            {fix.error_message && (
              <p className="text-xs text-destructive">Last error: {fix.error_message}</p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {canAutoApply && fix.status !== "applied" && (
                <Button size="sm" onClick={applyToWordPress} disabled={applying}>
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {applying ? "Publishing…" : "Apply to WordPress"}
                </Button>
              )}
              {fix.ready_to_apply?.payload?.value && (
                <Button size="sm" variant="outline" onClick={copyFix}>
                  <Copy className="h-4 w-4" /> Copy fix
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={generateFix} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Regenerate
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};