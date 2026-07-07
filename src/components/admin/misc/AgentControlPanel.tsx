import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { callAdminApi } from "@/lib/admin-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { Bot, Check, X, Loader2, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ClientOption {
  id: string;
  business_name: string;
}

interface AgentStep {
  step: number;
  tool: string;
  status: "ok" | "error" | "pending_approval";
  error?: string;
  ms: number;
}

interface AgentTrace {
  id: string;
  client_id: string;
  goal: string;
  status: string;
  stop_reason: string | null;
  steps: AgentStep[];
  step_count: number;
  final_summary: string | null;
  created_at: string;
  client_accounts?: { business_name: string };
}

interface PendingAction {
  id: string;
  trace_id: string;
  client_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  reasoning: string | null;
  status: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  stopped: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  failed: "bg-destructive/15 text-destructive",
  running: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
};

export default function AgentControlPanel() {
  const { adminPassword } = useAdminAuth();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);
  const [traces, setTraces] = useState<AgentTrace[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const clientName = useCallback(
    (id: string) => clients.find((c) => c.id === id)?.business_name ?? id,
    [clients],
  );

  const loadClients = useCallback(async () => {
    const { data } = await supabase
      .from("client_accounts")
      .select("id, business_name")
      .eq("status", "active")
      .order("business_name");
    setClients(data ?? []);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [tracesRes, pendingRes] = await Promise.all([
      callAdminApi<{ data: AgentTrace[] }>(adminPassword, { action: "list", table: "agent_traces" }),
      callAdminApi<{ data: PendingAction[] }>(adminPassword, { action: "list", table: "agent_pending_actions" }),
    ]);
    if (tracesRes.data) setTraces((tracesRes.data as any).data ?? []);
    if (pendingRes.data) setPendingActions(((pendingRes.data as any).data ?? []).filter((p: PendingAction) => p.status === "pending"));
    setLoading(false);
  }, [adminPassword]);

  useEffect(() => {
    loadClients();
    loadData();
  }, [loadClients, loadData]);

  const handleRunAgent = async () => {
    if (!selectedClient || !goal.trim()) {
      toast.error("Select a client and describe the goal");
      return;
    }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("run-agent", {
        body: { clientId: selectedClient, goal: goal.trim(), password: adminPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Agent run ${data.trace?.status ?? "finished"} — ${data.trace?.step_count ?? 0} step(s)`);
      setGoal("");
      await loadData();
    } catch (err) {
      toast.error(`Agent run failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRunning(false);
    }
  };

  const handleResolve = async (id: string, decision: "approved" | "rejected") => {
    setResolvingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("run-agent", {
        body: { action: "resolve_action", pendingActionId: id, decision, password: adminPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(decision === "approved" ? "Action approved and executed" : "Action rejected");
      await loadData();
    } catch (err) {
      toast.error(`Failed to resolve: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" /> AI Agent
          </CardTitle>
          <CardDescription>
            Give the agent a goal for a client. It reasons over available automation tools and calls what's needed.
            Actions that email the client directly are queued below for your approval instead of running immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger>
              <SelectValue placeholder="Select a client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder='e.g. "This client just signed up on the Growth tier — get their onboarding started" or "Their SEO has been flat, dig in and see what needs attention"'
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
          />
          <Button onClick={handleRunAgent} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {running ? "Running…" : "Run Agent"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending Approval ({pendingActions.length})</CardTitle>
          <CardDescription>The agent queued these because they email the client directly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingActions.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing waiting on approval.</p>
          )}
          {pendingActions.map((p) => (
            <div key={p.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{p.tool_name}</span>
                  <span className="text-sm text-muted-foreground ml-2">for {clientName(p.client_id)}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                </span>
              </div>
              {p.reasoning && <p className="text-sm text-muted-foreground">{p.reasoning}</p>}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleResolve(p.id, "approved")}
                  disabled={resolvingId === p.id}
                >
                  <Check className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleResolve(p.id, "rejected")}
                  disabled={resolvingId === p.id}
                >
                  <X className="h-4 w-4 mr-1" /> Reject
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && traces.length === 0 && (
            <p className="text-sm text-muted-foreground">No agent runs yet.</p>
          )}
          <Accordion type="single" collapsible className="w-full">
            {traces.slice(0, 20).map((t) => (
              <AccordionItem key={t.id} value={t.id}>
                <AccordionTrigger className="text-sm">
                  <div className="flex items-center gap-3 text-left">
                    <Badge className={statusColors[t.status] ?? ""}>{t.status}</Badge>
                    <span className="text-muted-foreground">{clientName(t.client_id)}</span>
                    <span className="truncate max-w-md">{t.goal}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-2">
                  {t.final_summary && <p className="text-sm">{t.final_summary}</p>}
                  <div className="text-xs text-muted-foreground">
                    {t.step_count} step(s) · stopped: {t.stop_reason ?? "—"}
                  </div>
                  <ul className="text-xs space-y-1">
                    {(t.steps ?? []).map((s, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{s.status}</Badge>
                        {s.tool}
                        {s.error && <span className="text-destructive">— {s.error}</span>}
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
