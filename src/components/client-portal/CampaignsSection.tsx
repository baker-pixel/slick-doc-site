import { Fragment, useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Archive, ChevronDown, ChevronUp, FileSpreadsheet, Loader2, Megaphone, Pause, Play, Plus, Sparkles } from "lucide-react";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { NewCampaignDialog } from "./NewCampaignDialog";

interface Campaign {
  id: string;
  name: string;
  kind: "csv_list" | "discovery";
  audience: "cold" | "existing";
  topic: string | null;
  max_steps: number;
  status: "active" | "paused" | "archived";
  created_at: string;
}

interface Stats {
  campaign_id: string;
  total: number;
  queued: number;
  in_outreach: number;
  finished: number;
  emailed: number;
  opened: number;
  clicked: number;
  replied: number;
  converted: number;
  bounced: number;
  unsubscribed: number;
}

interface Lead {
  id: string;
  name: string;
  email: string;
  status: string;
  drip_step: number;
  contact_first_name: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  discovered: "Reviewing", pending: "Queued", nurture: "In outreach", replied: "Replied", converted: "Converted",
  paused: "Paused", rejected: "Skipped", unsubscribed: "Unsubscribed", bounced: "Bounced", exhausted: "Finished",
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

// The campaign tables aren't in the generated Supabase types yet.
const db = supabase as any;

export function CampaignsSection({ clientAccountId, hasMailbox }: { clientAccountId: string; hasMailbox: boolean | null }) {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Campaign | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await db
      .from("prospect_campaigns")
      .select("id, name, kind, audience, topic, max_steps, status, created_at")
      .eq("client_id", clientAccountId)
      .neq("status", "archived")
      .order("created_at", { ascending: false });
    // Table not there yet (migration pending): behave as if campaigns don't exist.
    if (error) { setUnavailable(true); setCampaigns([]); return; }
    setUnavailable(false);
    setCampaigns(data ?? []);

    const res = await db.rpc("client_campaign_stats", { p_client_account_id: clientAccountId });
    const map: Record<string, Stats> = {};
    for (const row of (res.data ?? []) as Stats[]) map[row.campaign_id] = row;
    setStats(map);
  }, [clientAccountId]);

  useEffect(() => { load(); }, [load]);

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("prospect-campaign", { body: { client_id: clientAccountId, ...body } });
    const msg = await getEdgeErrorMessage(error, data);
    if (msg) throw new Error(friendlyEdgeMessage(msg));
    return data;
  };

  const setStatus = async (c: Campaign, status: "active" | "paused" | "archived") => {
    setBusyId(c.id);
    try {
      const data = await call({ action: "set_status", campaign_id: c.id, status });
      toast({
        title: status === "active" ? "Campaign resumed" : status === "paused" ? "Campaign paused" : "Campaign archived",
        description: status === "archived" ? `${data.cancelled_emails} scheduled emails were cancelled.` : undefined,
      });
      await load();
    } catch (e) {
      toast({ title: "Couldn't update the campaign", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusyId(null);
      setArchiveTarget(null);
    }
  };

  const findLeads = async (c: Campaign) => {
    setBusyId(c.id);
    try {
      const data = await call({ action: "run_discovery", campaign_id: c.id });
      const d = data.discovery as { ok: boolean; discovered?: number; error?: string };
      toast(d.ok
        ? { title: `${d.discovered ?? 0} new leads found` }
        : { title: "Couldn't find leads right now", description: d.error, variant: "destructive" });
      await load();
    } catch (e) {
      toast({ title: "Couldn't find leads", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const toggleLeads = async (c: Campaign) => {
    if (expanded === c.id) { setExpanded(null); return; }
    setExpanded(c.id);
    setLeads(null);
    const { data } = await db
      .from("prospects")
      .select("id, name, email, status, drip_step, contact_first_name")
      .eq("campaign_id", c.id)
      .order("created_at", { ascending: true })
      .limit(100);
    setLeads(data ?? []);
  };

  // Nothing to show and nothing the client could create yet.
  if (unavailable) return null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Megaphone className="w-4 h-4 text-primary" />
        <span className="font-medium text-sm">Campaigns</span>
        <Button size="sm" className="ml-auto gap-1.5" onClick={() => setDialogOpen(true)} disabled={hasMailbox !== true}>
          <Plus className="w-4 h-4" />New campaign
        </Button>
      </div>

      {campaigns === null ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Email a list of your own contacts, or run a topic-focused search for new leads. For example, announce a new product to your
          existing customers. {hasMailbox === false && "Connect your email inbox first."}
        </p>
      ) : (
        <div className="space-y-2">
          {campaigns.map((c) => {
            const st = stats[c.id];
            const busy = busyId === c.id;
            return (
              <Fragment key={c.id}>
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {c.kind === "csv_list" ? <FileSpreadsheet className="w-4 h-4 text-muted-foreground" /> : <Sparkles className="w-4 h-4 text-muted-foreground" />}
                    <span className="font-medium text-sm">{c.name}</span>
                    <Badge variant="outline" className="text-[11px]">{c.kind === "csv_list" ? "Your list" : "Lead search"}</Badge>
                    {c.audience === "existing" && <Badge variant="outline" className="text-[11px]">Existing contacts</Badge>}
                    {c.status === "paused" && <Badge variant="outline" className="text-[11px] bg-amber-100 text-amber-800 border-amber-200">Paused</Badge>}
                    <div className="ml-auto flex items-center gap-1">
                      {c.kind === "discovery" && c.status === "active" && (
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => findLeads(c)}>
                          <Sparkles className="w-3.5 h-3.5" />Find leads
                        </Button>
                      )}
                      {c.status === "active" ? (
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => setStatus(c, "paused")}>
                          <Pause className="w-3.5 h-3.5" />Pause
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => setStatus(c, "active")}>
                          <Play className="w-3.5 h-3.5" />Resume
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground" disabled={busy} onClick={() => setArchiveTarget(c)}>
                        <Archive className="w-3.5 h-3.5" />Archive
                      </Button>
                    </div>
                  </div>
                  {c.topic && <p className="text-xs text-muted-foreground">About: {c.topic}</p>}

                  {st ? (
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                      <span><b className="text-foreground tabular-nums">{st.total.toLocaleString()}</b> contacts</span>
                      <span><b className="text-foreground tabular-nums">{st.emailed.toLocaleString()}</b> emailed</span>
                      <span><b className="text-foreground tabular-nums">{pct(st.opened, st.emailed)}%</b> opened</span>
                      <span><b className="text-foreground tabular-nums">{st.replied + st.converted}</b> replied</span>
                      {st.bounced > 0 && <span>{st.bounced} bounced</span>}
                      {st.unsubscribed > 0 && <span>{st.unsubscribed} unsubscribed</span>}
                      <button type="button" onClick={() => toggleLeads(c)} className="ml-auto inline-flex items-center gap-1 underline-offset-2 hover:underline">
                        {expanded === c.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}Contacts
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No contacts yet.</p>
                  )}
                </div>

                {expanded === c.id && (
                  <div className="rounded-lg border overflow-hidden -mt-1">
                    {leads === null ? (
                      <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow><TableHead>Contact</TableHead><TableHead>Status</TableHead><TableHead className="w-20 text-right">Step</TableHead></TableRow>
                        </TableHeader>
                        <TableBody>
                          {leads.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell>
                                <div className="text-sm">{l.contact_first_name || l.name}</div>
                                <div className="text-xs text-muted-foreground">{l.email}</div>
                              </TableCell>
                              <TableCell className="text-xs">{STATUS_LABELS[l.status] ?? l.status}</TableCell>
                              <TableCell className="text-right text-xs tabular-nums">{l.drip_step}/{c.max_steps}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    {st && st.total > 100 && <p className="px-3 py-2 text-xs text-muted-foreground border-t">Showing the first 100 of {st.total.toLocaleString()} contacts.</p>}
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      )}

      <NewCampaignDialog open={dialogOpen} onOpenChange={setDialogOpen} clientAccountId={clientAccountId} onCreated={load} />

      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => { if (!o) setArchiveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive "{archiveTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This stops the campaign and cancels every email that hasn't been sent yet. Emails already sent can't be recalled. This can't be undone.
              To stop temporarily, use Pause instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep campaign</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiveTarget && setStatus(archiveTarget, "archived")}>Archive campaign</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
