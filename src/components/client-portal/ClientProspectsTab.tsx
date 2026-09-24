import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Loader2, Info, Radar, Users, CheckCircle2, Mail, Target, AlertTriangle, MapPin, Sparkles,
  Eye, MousePointerClick, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Search, Reply,
  XCircle, Clock, Send, Settings2,
} from "lucide-react";
import { CompanyContextCard } from "./CompanyContextCard";
import { ProspectIcpCard } from "./ProspectIcpCard";
import { OutreachSettingsCard } from "./OutreachSettingsCard";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";

interface Prospect {
  id: string;
  name: string;
  business_type: string | null;
  city: string | null;
  website_url: string;
  status: string;
  source: string;
  created_at: string;
  gap_score: number | null;
  icp_fit_score: number | null;
  icp_fit_reason: string | null;
  personalization_hook: string | null;
  top_weaknesses: string[] | null;
  drip_step: number;
  opened_at: string | null;
  clicked_at: string | null;
  reply_snippet: string | null;
  replied_at: string | null;
}

interface ProspectEmail {
  drip_step: number | null;
  subject: string;
  html_content: string;
  status: string;
  scheduled_for: string;
  sent_at: string | null;
}

interface SequenceStep {
  step_number: number;
  delay_days: number;
  cumulative_days: number;
}

// Mirrors the step themes run-prospect-drip actually writes into each
// prospect's personalized email (see stepThemes in that function) --
// client-facing summaries of the same four goals, not the raw AI prompt.
const SEQUENCE_STEP_LABELS: Record<number, { title: string; description: string }> = {
  1: { title: "Introduction", description: "A warm, personalized first note referencing something specific about the lead's business." },
  2: { title: "Follow-up", description: "Speaks to a pain point common in the lead's space and how you solve it." },
  3: { title: "What working with you looks like", description: "Concrete services and what sets you apart, aimed at booking a call." },
  4: { title: "Final check-in", description: "Short, low-pressure close asking if a quick call is worth it." },
};

// Covers every value run-prospect-drip and the admin review-queue action
// actually write to prospects.status -- a status missing here fell back to
// an unstyled badge showing the raw DB value (e.g. "replied" rendering as
// a blank outline pill next to colored ones for every other status).
const STATUS_STYLES: Record<string, string> = {
  discovered:    "bg-orange-100 text-orange-800 border-orange-200",
  pending:       "bg-blue-100 text-blue-800 border-blue-200",
  nurture:       "bg-purple-100 text-purple-800 border-purple-200",
  replied:       "bg-emerald-100 text-emerald-800 border-emerald-200",
  converted:     "bg-green-100 text-green-800 border-green-200",
  paused:        "bg-amber-100 text-amber-800 border-amber-200",
  rejected:      "bg-gray-100 text-gray-500 border-gray-200",
  unsubscribed:  "bg-gray-100 text-gray-500 border-gray-200",
  bounced:       "bg-gray-100 text-gray-500 border-gray-200",
  exhausted:     "bg-gray-100 text-gray-500 border-gray-200",
};

const STATUS_LABELS: Record<string, string> = {
  discovered:    "Reviewing",
  pending:       "Queued",
  nurture:       "In Outreach",
  replied:       "Replied",
  converted:     "Converted",
  paused:        "Paused",
  rejected:      "Skipped",
  unsubscribed:  "Unsubscribed",
  bounced:       "Bounced",
  exhausted:     "Sequence Complete",
};

type SortKey = "name" | "fit" | "status" | "created";
type SortDir = "asc" | "desc";

function initials(name: string): string {
  // Skip non-alphabetic tokens ("&", "-") so "Trumble & Partners" reads as
  // "TP", not "T&".
  const words = name.trim().split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

export default function ClientProspectsTab({ clientAccountId }: { clientAccountId: string }) {
  const [allProspects, setAllProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [emails, setEmails] = useState<ProspectEmail[] | null>(null);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [viewingEmail, setViewingEmail] = useState<ProspectEmail | null>(null);
  const [icpLocal, setIcpLocal] = useState(true);
  const [findingLeads, setFindingLeads] = useState(false);
  const [sequenceSteps, setSequenceSteps] = useState<SequenceStep[] | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadProspects = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("prospects")
      .select("id, name, business_type, city, website_url, status, source, created_at, gap_score, icp_fit_score, icp_fit_reason, personalization_hook, top_weaknesses, drip_step, opened_at, clicked_at, reply_snippet, replied_at")
      .eq("client_id", clientAccountId)
      .order("created_at", { ascending: false })
      .limit(200);
    setAllProspects(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadProspects();
    supabase.from("client_accounts").select("icp").eq("id", clientAccountId).single()
      .then(({ data }) => {
        const icp = data?.icp as { local?: boolean } | null;
        if (icp && typeof icp.local === "boolean") setIcpLocal(icp.local);
      });
    (supabase.rpc as any)("client_get_outreach_sequence").then(({ data }: { data: SequenceStep[] | null }) => {
      setSequenceSteps(data ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientAccountId]);

  const findLeadsNow = async () => {
    setFindingLeads(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        icpLocal ? "discover-prospects" : "discover-prospects-web",
        { body: { client_id: clientAccountId } },
      );
      const errMsg = await getEdgeErrorMessage(error, data);
      if (errMsg) throw new Error(friendlyEdgeMessage(errMsg));
      toast({ title: `${data.discovered ?? 0} new leads found`, description: "They'll be reviewed and added to your outreach queue shortly." });
      if ((data.discovered ?? 0) > 0) loadProspects();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Couldn't find new leads", description: msg, variant: "destructive" });
    } finally {
      setFindingLeads(false);
    }
  };

  const openDetail = async (p: Prospect) => {
    setSelected(p);
    setEmails(null);
    setViewingEmail(null);
    setEmailsLoading(true);
    const { data, error } = await (supabase.rpc as any)("client_get_prospect_emails", {
      p_client_account_id: clientAccountId,
      p_prospect_id: p.id,
    });
    setEmails(error ? [] : (data as ProspectEmail[]));
    setEmailsLoading(false);
  };

  const visible = allProspects.filter((p) => p.status !== "discovered");

  // Campaign-level stats, computed from what's already fetched -- no new RPC
  // needed. "Emailed" excludes leads still sitting in the pre-send queue.
  const emailed = visible.filter((p) => p.status !== "pending").length;
  const opened = visible.filter((p) => p.opened_at).length;
  const repliedOrConverted = visible.filter((p) => p.status === "replied" || p.status === "converted").length;
  const bounced = visible.filter((p) => p.status === "bounced").length;
  const converted = visible.filter((p) => p.status === "converted").length;

  const stats = [
    { label: "Total leads", value: visible.length, icon: Users, color: "text-blue-600" },
    { label: "Emailed", value: emailed, icon: Send, color: "text-indigo-600" },
    { label: "Open rate", value: `${pct(opened, emailed)}%`, icon: Eye, color: "text-sky-600" },
    { label: "Reply rate", value: `${pct(repliedOrConverted, emailed)}%`, icon: Reply, color: "text-emerald-600" },
    { label: "Bounced", value: bounced, icon: XCircle, color: "text-gray-500" },
    { label: "Converted", value: converted, icon: CheckCircle2, color: "text-green-600" },
  ];

  // Only surface tabs for statuses actually present, so a client with (say)
  // no bounces yet isn't shown an empty "Bounced" tab.
  const statusTabs = useMemo(() => {
    const present = new Set(visible.map((p) => p.status));
    return ["all", ...Object.keys(STATUS_LABELS).filter((s) => present.has(s))];
  }, [visible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = visible.filter((p) => statusFilter === "all" || p.status === statusFilter);
    if (q) {
      rows = rows.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.business_type ?? "").toLowerCase().includes(q) ||
        (p.city ?? "").toLowerCase().includes(q));
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "name": return a.name.localeCompare(b.name) * dir;
        case "fit": return ((a.icp_fit_score ?? -1) - (b.icp_fit_score ?? -1)) * dir;
        case "status": return a.status.localeCompare(b.status) * dir;
        default: return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
      }
    });
  }, [visible, statusFilter, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "created" ? "desc" : "asc");
    }
  };

  const SortHeader = ({ column, label, className }: { column: SortKey; label: string; className?: string }) => (
    <TableHead className={className}>
      <button type="button" onClick={() => toggleSort(column)} className="flex items-center gap-1 hover:text-foreground">
        {label}
        {sortKey === column && (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-3">
            <div className="flex items-center gap-2">
              <s.icon className={`w-4 h-4 shrink-0 ${s.color}`} />
              <div className="min-w-0">
                <div className="text-lg font-bold leading-tight">{s.value}</div>
                <div className="text-[11px] text-muted-foreground truncate">{s.label}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary/60" />
        <span className="flex-1">
          Orange Door is running outreach on your behalf, based on your ideal customer profile. Click a lead
          below to see why it was matched and what's been sent.
        </span>
        <Button size="sm" variant="outline" className="gap-2 shrink-0" onClick={findLeadsNow} disabled={findingLeads}>
          {findingLeads ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {findingLeads ? "Searching..." : "Find leads now"}
        </Button>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Radar className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No outreach has started yet.</p>
            <p className="text-sm text-muted-foreground">
              Orange Door will begin finding prospects for your business shortly.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
              <div className="flex items-center gap-1 overflow-x-auto">
                {statusTabs.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {s === "all" ? "All" : STATUS_LABELS[s]}
                    <span className="ml-1 opacity-70">{s === "all" ? visible.length : visible.filter((p) => p.status === s).length}</span>
                  </button>
                ))}
              </div>
              <div className="relative sm:ml-auto sm:w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search leads..."
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No leads match this filter.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHeader column="name" label="Lead" />
                    <SortHeader column="fit" label="Fit" className="hidden md:table-cell w-16" />
                    <TableHead className="hidden sm:table-cell">Activity</TableHead>
                    <SortHeader column="status" label="Status" />
                    <SortHeader column="created" label="Found" className="hidden lg:table-cell w-24" />
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => openDetail(p)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openDetail(p);
                        }
                      }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                            {initials(p.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{p.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {p.business_type ?? "Business"}{p.city ? ` · ${p.city}` : ""}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell tabular-nums text-sm">
                        {p.icp_fit_score ?? "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {p.clicked_at ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <MousePointerClick className="w-3.5 h-3.5" />Clicked
                          </span>
                        ) : p.opened_at ? (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-500">
                            <Eye className="w-3.5 h-3.5" />Opened
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs whitespace-nowrap ${STATUS_STYLES[p.status] ?? ""}`}>
                          {STATUS_LABELS[p.status] ?? p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground tabular-nums">
                        {format(new Date(p.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </Card>

      <Card className="p-4">
        <button
          type="button"
          onClick={() => setSettingsOpen((o) => !o)}
          className="flex w-full items-center justify-between text-sm font-medium"
        >
          <span className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-muted-foreground" />
            Campaign settings & sequence
          </span>
          {settingsOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {settingsOpen && (
          <div className="mt-4 space-y-3">
            <ProspectIcpCard clientAccountId={clientAccountId} />
            <CompanyContextCard clientAccountId={clientAccountId} />
            <OutreachSettingsCard clientAccountId={clientAccountId} />

            {sequenceSteps && sequenceSteps.length > 0 && (
              <Card className="p-4 space-y-3">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <Mail className="w-4 h-4 text-primary" />
                  Your outreach sequence
                </div>
                <p className="text-xs text-muted-foreground -mt-2">
                  Every matched lead automatically goes through these {sequenceSteps.length} emails, personalized per business.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {sequenceSteps.map((s) => {
                    const label = SEQUENCE_STEP_LABELS[s.step_number];
                    return (
                      <div key={s.step_number} className="rounded-lg border bg-muted/30 p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step {s.step_number}</span>
                          <Badge variant="outline" className="text-xs">Day {s.cumulative_days}</Badge>
                        </div>
                        <div className="text-sm font-medium">{label?.title ?? `Step ${s.step_number}`}</div>
                        <p className="text-xs text-muted-foreground">{label?.description ?? ""}</p>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        )}
      </Card>

      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setViewingEmail(null);
          }
        }}
      >
        <DialogContent
          className={
            viewingEmail
              ? "sm:max-w-2xl h-[85vh] flex flex-col p-0 gap-0"
              : "max-w-lg max-h-[85vh] overflow-y-auto"
          }
        >
          {selected && viewingEmail ? (
            <>
              <DialogHeader className="p-5 pb-4 border-b space-y-2 text-left shrink-0">
                <button
                  type="button"
                  onClick={() => setViewingEmail(null)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Back to {selected.name}
                </button>
                <DialogTitle className="text-base leading-snug pr-6">{viewingEmail.subject}</DialogTitle>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {viewingEmail.drip_step && <span>Step {viewingEmail.drip_step} of 4</span>}
                  <Badge variant="outline" className="text-xs capitalize">{viewingEmail.status}</Badge>
                  <span>
                    {viewingEmail.status === "sent" && viewingEmail.sent_at
                      ? `Sent ${format(new Date(viewingEmail.sent_at), "MMM d, yyyy 'at' h:mm a")}`
                      : `Scheduled for ${format(new Date(viewingEmail.scheduled_for), "MMM d, yyyy 'at' h:mm a")}`}
                  </span>
                </div>
              </DialogHeader>
              <iframe
                title={viewingEmail.subject}
                sandbox=""
                srcDoc={viewingEmail.html_content}
                className="flex-1 w-full bg-white"
              />
            </>
          ) : selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selected.name}
                  <Badge variant="outline" className={`text-xs ${STATUS_STYLES[selected.status] ?? ""}`}>
                    {STATUS_LABELS[selected.status] ?? selected.status}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4 shrink-0" />
                  {selected.business_type ?? "Business"}{selected.city ? ` · ${selected.city}` : ""}
                  {selected.website_url && (
                    <a href={selected.website_url} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate">
                      {selected.website_url}
                    </a>
                  )}
                </div>

                {(selected.opened_at || selected.clicked_at) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {selected.clicked_at ? (
                      <>
                        <MousePointerClick className="w-3.5 h-3.5 text-emerald-600" />
                        Clicked a link {format(new Date(selected.clicked_at), "MMM d, yyyy")}
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-blue-500" />
                        Opened an email {format(new Date(selected.opened_at!), "MMM d, yyyy")}
                      </>
                    )}
                  </div>
                )}

                {selected.reply_snippet && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-1">
                    <div className="flex items-center gap-2 font-medium text-emerald-800">
                      <Reply className="w-4 h-4" />
                      They replied
                      {selected.replied_at && (
                        <span className="font-normal text-xs text-emerald-700/80">
                          {format(new Date(selected.replied_at), "MMM d, yyyy 'at' h:mm a")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-emerald-900 whitespace-pre-wrap">{selected.reply_snippet}</p>
                  </div>
                )}

                {selected.icp_fit_score != null && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Target className="w-4 h-4 text-primary" />
                      Fit score: {selected.icp_fit_score}/100
                    </div>
                    {selected.icp_fit_reason && (
                      <p className="text-muted-foreground text-xs">{selected.icp_fit_reason}</p>
                    )}
                  </div>
                )}

                {selected.top_weaknesses && selected.top_weaknesses.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-medium text-xs uppercase tracking-wide text-muted-foreground">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Gaps we're using as the hook
                    </div>
                    <ul className="list-disc list-inside text-muted-foreground text-xs space-y-0.5">
                      {selected.top_weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}

                {selected.personalization_hook && (
                  <div className="space-y-1">
                    <div className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Personalization angle</div>
                    <p className="text-muted-foreground text-xs">{selected.personalization_hook}</p>
                  </div>
                )}

                <div className="space-y-3 border-t pt-3">
                  <div className="flex items-center gap-2 font-medium text-xs uppercase tracking-wide text-muted-foreground">
                    <Mail className="w-3.5 h-3.5" />
                    Sequence timeline
                  </div>
                  {emailsLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : !emails || emails.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nothing queued yet — this lead hasn't entered the sequence.</p>
                  ) : (
                    <ol>
                      {emails.map((e, i) => {
                        const isSent = e.status === "sent" && !!e.sent_at;
                        const isFailed = ["failed", "skipped", "cancelled"].includes(e.status);
                        const StepIcon = isSent ? Send : isFailed ? XCircle : Clock;
                        const iconColor = isSent
                          ? "text-emerald-700 bg-emerald-100"
                          : isFailed
                          ? "text-gray-400 bg-gray-100"
                          : "text-blue-600 bg-blue-100";
                        return (
                          <li key={i} className="relative pl-8 pb-3 last:pb-0">
                            {i < emails.length - 1 && (
                              <span className="absolute left-[11px] top-6 bottom-0 w-px bg-border" />
                            )}
                            <span className={`absolute left-0 top-0.5 flex h-6 w-6 items-center justify-center rounded-full ${iconColor}`}>
                              <StepIcon className="w-3.5 h-3.5" />
                            </span>
                            <button
                              type="button"
                              onClick={() => isSent && setViewingEmail(e)}
                              disabled={!isSent}
                              className={`flex w-full items-center gap-2 rounded-lg border bg-background px-3 py-2 text-left text-xs ${
                                isSent ? "hover:bg-muted/40 transition-colors" : "opacity-70 cursor-default"
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-medium truncate">{e.subject}</div>
                                <div className="text-muted-foreground">
                                  {e.drip_step ? `Step ${e.drip_step} · ` : ""}
                                  {isSent
                                    ? format(new Date(e.sent_at!), "MMM d, yyyy 'at' h:mm a")
                                    : `Scheduled ${format(new Date(e.scheduled_for), "MMM d, yyyy")}`}
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs capitalize shrink-0">{e.status}</Badge>
                              {isSent && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
