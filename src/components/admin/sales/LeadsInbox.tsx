import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  CalendarCheck, Check, ClipboardList, Copy, ExternalLink, FileDown, Flame, Globe, Loader2, Mail, MessageSquare,
  Phone, RefreshCw, Search, Send, Sparkles, UserPlus, Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getMarketingOrigin } from "@/lib/getPortalUrl";
import type { InviteLead } from "@/lib/inviteLeadToPortal";
import { toast } from "@/hooks/use-toast";
import { buildLeads, INTEREST_HELP, LEADS_LAST_SEEN_KEY, type Lead, type Source, type Stage } from "./leadsModel";

// One list of every person who has raised their hand on the marketing site,
// whichever door they came through (quick scan, full gap analysis, contact
// form, PDF download). The four separate tables used to live in four tabs, so
// the same person could appear in several and nobody could see "who is this and
// what have they done". Repeat submissions from one email are merged here.

interface LeadsInboxProps {
  contacts: any[];
  gapAnalyses: any[];
  pdfLeads: any[];
  quickScanLeads: any[];
  invitedEmails: Set<string>;
  invitingEmail: string | null;
  onInvite: (lead: InviteLead) => void;
  onOpenGap: (gap: any) => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

const PAGE_SIZE = 25;
// Set the first time the inbox opens in this page load; see the effect below.
let sessionBaseline: number | null = null;

const SOURCE_META: Record<Source, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  quick_scan: { label: "Quick scan", icon: Zap, tone: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300" },
  gap_analysis: { label: "Full analysis", icon: ClipboardList, tone: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300" },
  contact: { label: "Contact form", icon: MessageSquare, tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  pdf: { label: "PDF download", icon: FileDown, tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};

const STAGE_TONE: Record<Stage, string> = {
  New: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  "Follow up": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  "Call booked": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  Invited: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Client: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

const STAGE_HELP: Record<Stage, string> = {
  New: "Arrived in the last 3 days and nobody has acted on it yet.",
  "Follow up": "Older than 3 days with no call booked and no portal invite. These are the ones to keep warm.",
  "Call booked": "Asked for or booked a strategy call.",
  Invited: "Has been sent a portal invitation that is still open.",
  Client: "Already has a client account.",
};

function scoreTone(score: number | null) {
  if (score == null) return "text-muted-foreground";
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 45) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function InterestBadge({ interest }: { interest: Lead["interest"] }) {
  const tone =
    interest === "High" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" :
    interest === "Medium" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" :
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return (
    <Badge variant="secondary" className={cn("gap-1 font-medium", tone)} title={INTEREST_HELP[interest]}>
      {interest === "High" && <Flame className="h-3 w-3" />}
      {interest}
    </Badge>
  );
}

function SourceBadges({ lead }: { lead: Lead }) {
  const counts = new Map<Source, number>();
  for (const t of lead.touches) counts.set(t.source, (counts.get(t.source) ?? 0) + 1);
  return (
    <div className="flex flex-wrap gap-1">
      {[...counts.entries()].map(([source, n]) => {
        const meta = SOURCE_META[source];
        return (
          <Badge key={source} variant="secondary" className={cn("gap-1 font-medium", meta.tone)}>
            <meta.icon className="h-3 w-3" />
            {meta.label}{n > 1 ? ` ×${n}` : ""}
          </Badge>
        );
      })}
    </div>
  );
}

function When({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <span title={format(d, "PPpp")} className="whitespace-nowrap">
      {formatDistanceToNow(d, { addSuffix: true })}
    </span>
  );
}

export function LeadsInbox({
  contacts, gapAnalyses, pdfLeads, quickScanLeads, invitedEmails, invitingEmail, onInvite, onOpenGap, onRefresh, isLoading,
}: LeadsInboxProps) {
  // null until the client list has loaded, so converted people never flash into the list first.
  const [clientEmails, setClientEmails] = useState<Set<string> | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | Source>("all");
  const [stageFilter, setStageFilter] = useState<"all" | Stage>("all");
  const [interestFilter, setInterestFilter] = useState<"all" | Lead["interest"]>("all");
  const [sort, setSort] = useState<"recent" | "score">("recent");
  const [page, setPage] = useState(1);
  const [openKey, setOpenKey] = useState<string | null>(null);

  // What was new when the admin last looked. The baseline is captured once per
  // page load (so switching tabs doesn't make the markers disappear), then the
  // stored "last looked" time moves to now so the next visit starts fresh.
  const [lastSeen, setLastSeen] = useState(0);
  useEffect(() => {
    try {
      if (sessionBaseline === null) sessionBaseline = Number(localStorage.getItem(LEADS_LAST_SEEN_KEY) || 0);
      setLastSeen(sessionBaseline);
      localStorage.setItem(LEADS_LAST_SEEN_KEY, String(Date.now()));
      window.dispatchEvent(new Event("admin-leads-seen")); // clears the sidebar badge
    } catch { /* private mode: no "new since" marker, everything else works */ }
  }, []);

  // People who already have a client account are not leads to chase.
  useEffect(() => {
    supabase.from("client_accounts").select("email").then(({ data }) => {
      setClientEmails(new Set((data ?? []).map((c: any) => String(c.email || "").toLowerCase())));
    });
  }, []);

  // Converted leads (already a client) are not shown: this page is for people
  // still to win, and they are handled in Clients.
  const leads = useMemo(
    () => clientEmails === null
      ? []
      : buildLeads({ contacts, gapAnalyses, pdfLeads, quickScanLeads }, { invitedEmails, clientEmails })
          .filter((l) => l.stage !== "Client"),
    [contacts, gapAnalyses, pdfLeads, quickScanLeads, invitedEmails, clientEmails],
  );

  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86_400_000;
    return {
      total: leads.length,
      newWeek: leads.filter((l) => new Date(l.lastActivity).getTime() > weekAgo).length,
      high: leads.filter((l) => l.interest === "High").length,
      followUp: leads.filter((l) => l.stage === "Follow up").length,
      newSinceVisit: lastSeen
        ? leads.filter((l) => new Date(l.lastActivity).getTime() > lastSeen).length
        : 0,
    };
  }, [leads, lastSeen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = leads.filter((l) => {
      if (sourceFilter !== "all" && !l.touches.some((t) => t.source === sourceFilter)) return false;
      if (stageFilter !== "all" && l.stage !== stageFilter) return false;
      if (interestFilter !== "all" && l.interest !== interestFilter) return false;
      if (!q) return true;
      return [l.name, l.email, l.business, l.website].some((v) => v?.toLowerCase().includes(q));
    });
    rows.sort((a, b) =>
      sort === "score"
        ? (b.latestScore ?? -1) - (a.latestScore ?? -1)
        : new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
    return rows;
  }, [leads, search, sourceFilter, stageFilter, interestFilter, sort]);

  useEffect(() => setPage(1), [search, sourceFilter, stageFilter, interestFilter, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const open = openKey ? leads.find((l) => l.key === openKey) ?? null : null;

  const isNewSinceVisit = (l: Lead) => lastSeen > 0 && new Date(l.lastActivity).getTime() > lastSeen;

  return (
    <div className="space-y-4">
      {/* Summary: each tile is a shortcut to the matching filter */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryTile label="All leads" value={stats.total} hint="Unique people, repeat submissions merged"
          onClick={() => { setStageFilter("all"); setInterestFilter("all"); setSourceFilter("all"); setSearch(""); }} />
        <SummaryTile label="Active this week" value={stats.newWeek} hint="Did something in the last 7 days"
          onClick={() => setSort("recent")} />
        <SummaryTile label="High interest" value={stats.high} hint={INTEREST_HELP.High} tone="text-red-600 dark:text-red-400"
          onClick={() => { setInterestFilter("High"); setStageFilter("all"); }} />
        <SummaryTile label="Needs follow-up" value={stats.followUp} hint={STAGE_HELP["Follow up"]} tone="text-amber-600 dark:text-amber-400"
          onClick={() => { setStageFilter("Follow up"); setInterestFilter("all"); }} />
      </div>

      {stats.newSinceVisit > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-orange-300/60 bg-orange-50 px-4 py-2.5 text-sm text-orange-900 dark:border-orange-500/30 dark:bg-orange-950/30 dark:text-orange-200">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span><strong>{stats.newSinceVisit}</strong> {stats.newSinceVisit === 1 ? "lead has" : "leads have"} new activity since you last looked. They are marked with a dot.</span>
        </div>
      )}

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, business or website" className="pl-9" />
            </div>
            <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as any)}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {(Object.keys(SOURCE_META) as Source[]).map((s) => <SelectItem key={s} value={s}>{SOURCE_META[s].label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={stageFilter} onValueChange={(v) => setStageFilter(v as any)}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Stage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {(Object.keys(STAGE_TONE) as Stage[]).filter((s) => s !== "Client").map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={interestFilter} onValueChange={(v) => setInterestFilter(v as any)}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Interest" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any interest</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as any)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most recent first</SelectItem>
                <SelectItem value="score">Highest score first</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={onRefresh} disabled={isLoading} title="Refresh">
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            <strong>Interest</strong>: High = finished the full analysis or asked for a call, Medium = ran a quick scan or started the full analysis, Low = only downloaded a PDF.
            {" "}<strong>Score</strong> is the website score from their report.
          </p>

          {visible.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {clientEmails === null
                ? "Loading leads…"
                : leads.length === 0
                ? "No open leads. People appear here when they run a quick scan, fill in the gap analysis, send the contact form or download a PDF. Anyone who becomes a client is removed from this list."
                : "No leads match these filters."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Interest</TableHead>
                    <TableHead>Came from</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Last activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((l) => (
                    <TableRow key={l.key} className="cursor-pointer" onClick={() => setOpenKey(l.key)}>
                      <TableCell className="max-w-[300px]">
                        <div className="flex items-start gap-2">
                          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", isNewSinceVisit(l) ? "bg-orange-500" : "bg-transparent")} aria-label={isNewSinceVisit(l) ? "New activity" : undefined} />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{l.name || l.email}</p>
                            <p className="text-xs text-muted-foreground truncate">{l.email}</p>
                            {(l.business || l.website) && (
                              <p className="text-xs text-muted-foreground truncate">
                                {[l.business, l.website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><InterestBadge interest={l.interest} /></TableCell>
                      <TableCell><SourceBadges lead={l} /></TableCell>
                      <TableCell className={cn("text-right font-semibold tabular-nums", scoreTone(l.latestScore))}>{l.latestScore ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={cn("font-medium", STAGE_TONE[l.stage])} title={STAGE_HELP[l.stage]}>{l.stage}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground"><When iso={l.lastActivity} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page === pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <LeadSheet
        lead={open}
        onClose={() => setOpenKey(null)}
        invitingEmail={invitingEmail}
        onInvite={onInvite}
        onOpenGap={onOpenGap}
      />
    </div>
  );
}

function SummaryTile({ label, value, hint, tone, onClick }: { label: string; value: number; hint: string; tone?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={hint}
      className="rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-3xl font-semibold tabular-nums", tone)}>{value}</p>
    </button>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7" title={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast({ title: "Couldn't copy", description: "Select the text and copy it manually.", variant: "destructive" });
        }
      }}>
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

interface SentEmail { id: string; subject: string; status: string; sent_at: string | null }

function LeadSheet({ lead, onClose, invitingEmail, onInvite, onOpenGap }: {
  lead: Lead | null; onClose: () => void; invitingEmail: string | null; onInvite: (l: InviteLead) => void; onOpenGap: (g: any) => void;
}) {
  const [emails, setEmails] = useState<SentEmail[] | null>(null);

  // What we've already sent them, so a follow-up doesn't repeat or collide.
  useEffect(() => {
    setEmails(null);
    if (!lead) return;
    let cancelled = false;
    supabase.from("email_logs").select("id, subject, status, sent_at")
      .ilike("recipient_email", lead.email).order("sent_at", { ascending: false }).limit(8)
      .then(({ data }) => { if (!cancelled) setEmails((data as SentEmail[]) ?? []); });
    return () => { cancelled = true; };
  }, [lead?.email]);

  const marketing = getMarketingOrigin();
  const canInvite = lead && lead.stage !== "Client" && lead.stage !== "Invited";

  return (
    <Sheet open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {lead && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle>{lead.name || lead.email}</SheetTitle>
              <SheetDescription>{lead.business || "No business name given"}</SheetDescription>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <InterestBadge interest={lead.interest} />
                <Badge variant="secondary" className={cn("font-medium", STAGE_TONE[lead.stage])} title={STAGE_HELP[lead.stage]}>{lead.stage}</Badge>
                {lead.latestScore != null && <span className={cn("text-sm font-semibold", scoreTone(lead.latestScore))}>Score {lead.latestScore}</span>}
              </div>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</h3>
                <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /><a className="underline-offset-2 hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a><CopyButton value={lead.email} label="email" /></div>
                {lead.phone && <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /><a className="hover:underline" href={`tel:${lead.phone}`}>{lead.phone}</a><CopyButton value={lead.phone} label="phone" /></div>}
                {lead.website && <div className="flex items-center gap-2 text-sm"><Globe className="h-4 w-4 text-muted-foreground" /><a className="hover:underline truncate" href={lead.website} target="_blank" rel="noopener noreferrer">{lead.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a><ExternalLink className="h-3 w-3 text-muted-foreground" /></div>}
                {lead.challenge && (
                  <div className="rounded-lg bg-muted/50 p-3 text-sm"><p className="text-xs font-medium text-muted-foreground mb-1">Their marketing challenge</p>{lead.challenge}</div>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What they did</h3>
                <ol className="space-y-3">
                  {lead.touches.map((t) => {
                    const meta = SOURCE_META[t.source];
                    return (
                      <li key={`${t.source}-${t.id}`} className="flex gap-3">
                        <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", meta.tone)}><meta.icon className="h-3.5 w-3.5" /></div>
                        <div className="min-w-0 flex-1 text-sm">
                          <p className="font-medium">{t.label}{t.score != null && <span className={cn("ml-2 font-semibold", scoreTone(t.score))}>Score {t.score}</span>}</p>
                          <p className="text-xs text-muted-foreground"><When iso={t.at} />{t.detail ? ` · ${t.detail}` : ""}</p>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                            {t.reportToken && (
                              <a className="inline-flex items-center gap-1 text-primary hover:underline" target="_blank" rel="noopener noreferrer" href={`${marketing}/quick-report/${t.reportToken}`}>
                                <ExternalLink className="h-3 w-3" />View their report
                              </a>
                            )}
                            {t.source === "gap_analysis" && (
                              <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => onOpenGap(t.raw)}>
                                <ClipboardList className="h-3 w-3" />Open their full answers
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emails we've sent them</h3>
                {emails === null ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…</p>
                ) : emails.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {emails.map((e) => (
                      <li key={e.id} className="flex items-start justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate"><Send className="mr-1.5 inline h-3 w-3 text-muted-foreground" />{e.subject}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {e.sent_at ? <When iso={e.sent_at} /> : "—"}{e.status === "bounced" ? " · bounced" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button asChild size="sm"><a href={`mailto:${lead.email}`}><Mail className="mr-1.5 h-4 w-4" />Email</a></Button>
                {canInvite && (
                  <Button size="sm" variant="outline" disabled={invitingEmail === lead.email}
                    onClick={() => onInvite({
                      email: lead.email,
                      first_name: lead.firstName,
                      last_name: lead.lastName,
                      business_name: lead.business || lead.name || lead.email,
                      overall_score: lead.latestScore,
                      website_url: lead.website,
                      lead_id: lead.gapId,
                    })}>
                    {invitingEmail === lead.email ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1.5 h-4 w-4" />}
                    Invite to portal
                  </Button>
                )}
                {lead.stage === "Call booked" && <Badge variant="secondary" className="gap-1"><CalendarCheck className="h-3 w-3" />Call booked</Badge>}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
