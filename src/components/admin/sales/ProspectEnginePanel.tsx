import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  Globe,
  Phone,
  MapPin,
  Mail,
  AlertTriangle,
  ExternalLink,
  Radar,
  ChevronLeft,
  ChevronRight,
  Users,
  Clock,
  TrendingUp,
  Eye,
  MousePointerClick,
} from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";

interface ClientOption {
  id: string;
  business_name: string;
}

interface Prospect {
  id: string;
  name: string;
  email: string;
  website_url: string;
  phone: string | null;
  city: string | null;
  business_type: string | null;
  source: string;
  status: string;
  gap_score: number | null;
  icp_fit_score: number | null;
  icp_fit_reason: string | null;
  client_id: string | null;
  created_at: string;
  approved_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
}

interface IcpSuggestion {
  query: string;
  location: string;
}

interface IcpInfo {
  summary: string;
  maps_suitable: boolean;
  suggestions: IcpSuggestion[];
}

const PAGE_SIZE = 15;

const STATUS_COLORS: Record<string, string> = {
  discovered:   "bg-amber-100 text-amber-800 border-amber-200",
  pending:      "bg-blue-100 text-blue-800 border-blue-200",
  nurture:      "bg-purple-100 text-purple-800 border-purple-200",
  converted:    "bg-green-100 text-green-800 border-green-200",
  rejected:     "bg-gray-100 text-gray-600 border-gray-200",
  exhausted:    "bg-slate-100 text-slate-600 border-slate-200",
  unsubscribed: "bg-rose-100 text-rose-700 border-rose-200",
  bounced:      "bg-red-100 text-red-700 border-red-200",
  replied:      "bg-emerald-100 text-emerald-700 border-emerald-200",
  paused:       "bg-yellow-100 text-yellow-800 border-yellow-200",
};

const fitBadgeClass = (score: number | null) => {
  if (score === null) return "bg-gray-100 text-gray-500 border-gray-200";
  if (score >= 61) return "bg-green-100 text-green-700 border-green-200";
  if (score >= 31) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-red-100 text-red-700 border-red-200";
};

const SOURCE_COLORS: Record<string, string> = {
  outbound: "bg-orange-100 text-orange-700 border-orange-200",
  inbound:  "bg-teal-100 text-teal-700 border-teal-200",
};

export default function ProspectEnginePanel() {
  const { adminPassword } = useAdminAuth();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionIds, setActionIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Inline email editing for outbound prospects with no email
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});

  // Discovery form
  const [discClientId, setDiscClientId] = useState("");
  const [discQuery, setDiscQuery]       = useState("");
  const [discLocation, setDiscLocation] = useState("");
  const [discovering, setDiscovering]   = useState(false);
  const [discResult, setDiscResult]     = useState<{ discovered: number; skipped: number; noWebsite: number; emailEnrichment: boolean } | null>(null);

  // ICP guidance
  const [icpInfo, setIcpInfo]       = useState<IcpInfo | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  // "maps" = Google Places (local businesses); "web" = AI web research
  // (B2B/national ICPs Maps can't reach). Auto-switches after Suggest.
  const [discSource, setDiscSource] = useState<"maps" | "web">("maps");
  // Set when the typed query fails the ICP check; second click overrides.
  const [icpMismatch, setIcpMismatch] = useState<string | null>(null);

  // Filters
  const [filterClient, setFilterClient] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [pageQueue, setPageQueue] = useState(1);
  const [pageAll, setPageAll] = useState(1);

  // Email thread viewer dialog
  const [threadProspect, setThreadProspect] = useState<Prospect | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadData, setThreadData] = useState<{
    sent: { subject: string; status: string; sent_at: string }[];
    scheduled: { subject: string; scheduled_for: string }[];
  } | null>(null);

  // All reads/writes go through the `admin` edge function (service role +
  // checkAdminAuth) rather than direct table queries: prospects RLS is
  // admin-JWT-only now, and a legacy password login carries no JWT -- direct
  // queries would return nothing (or, before the lockdown, leak data).
  const loadClients = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("admin", {
      body: { action: "list", table: "client_accounts", password: adminPassword },
    });
    if (error || data?.error) {
      const msg = await getEdgeErrorMessage(error, data);
      toast({ title: "Error loading clients", description: msg ? friendlyEdgeMessage(msg) : "Something went wrong", variant: "destructive" });
      return;
    }
    const rows = (data?.data ?? [])
      .filter((c: { status?: string }) => c.status === "active")
      .map((c: { id: string; business_name: string }) => ({ id: c.id, business_name: c.business_name }))
      .sort((a: ClientOption, b: ClientOption) => a.business_name.localeCompare(b.business_name));
    setClients(rows);
  }, [adminPassword]);

  const loadProspects = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("admin", {
      body: { action: "list", table: "prospects", password: adminPassword },
    });
    if (error || data?.error) {
      const msg = await getEdgeErrorMessage(error, data);
      toast({ title: "Error loading prospects", description: msg ? friendlyEdgeMessage(msg) : "Something went wrong", variant: "destructive" });
      setProspects([]);
      setLoading(false);
      return;
    }
    // `prospects` also holds marketing-site /quick-analysis leads
    // (source: "inbound") -- a totally different audience that has its own
    // "Quick Scans" tab under the Leads section. This panel is only for
    // candidates discovered/emailed on behalf of a client's own cold
    // outreach, so it's scoped to source: "outbound" regardless of the
    // client filter below.
    let rows: Prospect[] = (data?.data ?? []).filter((p: Prospect) => p.source === "outbound");
    if (filterClient !== "all") {
      rows = rows.filter(p => p.client_id === filterClient);
    }
    setProspects(rows.slice(0, 500));
    setLoading(false);
  }, [filterClient, adminPassword]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    loadProspects();
    setPageQueue(1);
    setPageAll(1);
    setSelected(new Set());
  }, [loadProspects]);

  const markAction = (id: string, add: boolean) => {
    setActionIds(prev => {
      const next = new Set(prev);
      if (add) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const updateStatus = async (ids: string[], status: string) => {
    ids.forEach(id => markAction(id, true));

    // Drafted emails ride along with an approval in the same call
    const emails: Record<string, string> = {};
    if (status === "pending") {
      for (const id of ids) {
        if (emailDrafts[id]?.includes("@")) emails[id] = emailDrafts[id];
      }
    }

    const { data, error } = await supabase.functions.invoke("admin", {
      body: {
        action: "update_prospects_status",
        data: { ids, status, emails },
        password: adminPassword,
      },
    });
    ids.forEach(id => markAction(id, false));
    if (error || data?.error) {
      const msg = await getEdgeErrorMessage(error, data);
      toast({ title: "Update failed", description: msg ? friendlyEdgeMessage(msg) : "Something went wrong", variant: "destructive" });
    } else {
      const label: Record<string, string> = {
        pending: "approved", rejected: "rejected", replied: "marked replied",
        paused: "paused", nurture: "resumed",
      };
      toast({ title: `${ids.length} ${label[status] ?? "updated"}` });
      setSelected(new Set());
      setEmailDrafts({});
      loadProspects();
    }
  };

  const openThread = async (p: Prospect) => {
    setThreadProspect(p);
    setThreadData(null);
    setThreadLoading(true);
    const { data, error } = await supabase.functions.invoke("admin", {
      body: { action: "get_prospect_emails", data: { prospect_id: p.id }, password: adminPassword },
    });
    if (error || data?.error) {
      const msg = await getEdgeErrorMessage(error, data);
      toast({ title: "Failed to load email thread", description: msg ? friendlyEdgeMessage(msg) : "Something went wrong", variant: "destructive" });
      setThreadLoading(false);
      return;
    }
    setThreadData(data?.data ?? { sent: [], scheduled: [] });
    setThreadLoading(false);
  };

  const suggestFromIcp = async () => {
    if (!discClientId) {
      toast({ title: "Select a client first", variant: "destructive" });
      return;
    }
    setSuggesting(true);
    setIcpInfo(null);
    try {
      const { data, error } = await supabase.functions.invoke("prospect-icp", {
        body: { client_id: discClientId, action: "suggest", password: adminPassword },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "ICP suggestion failed");
      }
      setIcpInfo({
        summary: data.icp?.summary ?? "",
        maps_suitable: data.maps_suitable !== false,
        suggestions: data.suggestions ?? [],
      });
      if (data.maps_suitable === false) setDiscSource("web");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "ICP suggestion failed", description: msg, variant: "destructive" });
    } finally {
      setSuggesting(false);
    }
  };

  const runDiscovery = async () => {
    if (!discClientId || (discSource === "maps" && (!discQuery || !discLocation))) {
      toast({ title: discSource === "maps" ? "Fill in all fields" : "Select a client first", variant: "destructive" });
      return;
    }
    setDiscovering(true);
    setDiscResult(null);
    try {
      // Maps searches are free-text -- validate against the client's ICP
      // first; a mismatch (e.g. "HVAC companies" for an AI consultancy)
      // needs an explicit second click to run anyway. Web research is
      // built from the ICP itself, so no check needed there.
      if (discSource === "maps" && !icpMismatch) {
        const { data: check } = await supabase.functions.invoke("prospect-icp", {
          body: { client_id: discClientId, action: "check", query: discQuery, location: discLocation, password: adminPassword },
        });
        if (check && check.fit === false) {
          setIcpMismatch(check.reason || "This search doesn't match the client's ideal customer profile.");
          setDiscovering(false);
          return;
        }
      }
      setIcpMismatch(null);

      const { data, error } = await supabase.functions.invoke(
        discSource === "maps" ? "discover-prospects" : "discover-prospects-web",
        {
          body: discSource === "maps"
            ? { client_id: discClientId, query: discQuery, location: discLocation, max_results: 20, password: adminPassword }
            : { client_id: discClientId, focus: discQuery || undefined, geography: discLocation || undefined, max_results: 15, password: adminPassword },
        },
      );
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Prospect discovery failed");
      }
      setDiscResult({
        discovered: data.discovered ?? 0,
        skipped: data.skipped_duplicates ?? 0,
        noWebsite: data.skipped_no_website ?? 0,
        emailEnrichment: data.email_enrichment !== false,
      });
      toast({ title: `${data.discovered ?? 0} new prospects found` });
      if ((data.discovered ?? 0) > 0) loadProspects();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Discovery failed", description: msg, variant: "destructive" });
    } finally {
      setDiscovering(false);
    }
  };

  const clientName = (id: string | null) =>
    id ? (clients.find(c => c.id === id)?.business_name ?? id.slice(0, 8)) : "Unassigned";

  // Derived lists -- review queue ranked by ICP fit (unscored last)
  const reviewQueue = prospects
    .filter(p => p.status === "discovered")
    .sort((a, b) => (b.icp_fit_score ?? -1) - (a.icp_fit_score ?? -1));

  const searchFilter = (p: Prospect) => {
    if (!filterSearch) return true;
    const q = filterSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.website_url ?? "").toLowerCase().includes(q) ||
      (p.city ?? "").toLowerCase().includes(q) ||
      (p.business_type ?? "").toLowerCase().includes(q)
    );
  };

  const filteredQueue  = reviewQueue.filter(searchFilter);
  const allFiltered    = prospects.filter(p => p.status !== "discovered").filter(searchFilter);

  const paginate = <T,>(arr: T[], pg: number) =>
    arr.slice((pg - 1) * PAGE_SIZE, pg * PAGE_SIZE);

  const queuePage  = paginate(filteredQueue, pageQueue);
  const allPage    = paginate(allFiltered, pageAll);

  const totalQueuePages = Math.ceil(filteredQueue.length / PAGE_SIZE);
  const totalAllPages   = Math.ceil(allFiltered.length / PAGE_SIZE);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = (rows: Prospect[]) => {
    const ids = rows.map(r => r.id);
    const allSelected = ids.every(id => selected.has(id));
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const ProspectRow = ({ p, showActions }: { p: Prospect; showActions: boolean }) => {
    const hasEmail = p.email && p.email.includes("@");
    const draftEmail = emailDrafts[p.id] ?? "";
    const canApprove = hasEmail || draftEmail.includes("@");

    return (
      <tr key={p.id} className="border-b hover:bg-muted/40 transition-colors">
        {showActions && (
          <td className="p-2 w-8">
            <Checkbox
              checked={selected.has(p.id)}
              onCheckedChange={() => toggleSelect(p.id)}
            />
          </td>
        )}
        <td className="p-3">
          <div className="font-medium text-sm">{p.name}</div>
          {p.business_type && (
            <div className="text-xs text-muted-foreground mt-0.5">{p.business_type}</div>
          )}
        </td>
        <td className="p-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className={`text-xs ${fitBadgeClass(p.icp_fit_score)}`}>
                  {p.icp_fit_score === null ? "—" : p.icp_fit_score}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px]">
                {p.icp_fit_reason || (p.icp_fit_score === null ? "Not scored yet — scoring runs after context enrichment" : "No reason recorded")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </td>
        <td className="p-3">
          {p.website_url ? (
            <a
              href={p.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
            >
              <Globe className="w-3 h-3 flex-shrink-0" />
              <span className="truncate max-w-[160px]">
                {p.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </span>
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="p-3">
          {/* Email — inline input for outbound prospects with no email */}
          {showActions && !hasEmail ? (
            <div className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
              <Input
                className="h-6 text-xs w-36 px-1.5"
                placeholder="email@domain.com"
                value={draftEmail}
                onChange={e =>
                  setEmailDrafts(prev => ({ ...prev, [p.id]: e.target.value }))
                }
              />
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {hasEmail && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Mail className="w-3 h-3" />{p.email}
                </span>
              )}
              {p.phone && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="w-3 h-3" />{p.phone}
                </span>
              )}
              {p.city && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3" />{p.city}
                </span>
              )}
            </div>
          )}
          {/* Contact info in all-prospects view */}
          {!showActions && (
            <div className="flex flex-col gap-0.5">
              {p.phone && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="w-3 h-3" />{p.phone}
                </span>
              )}
              {p.city && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3" />{p.city}
                </span>
              )}
            </div>
          )}
        </td>
        <td className="p-3">
          <Badge variant="outline" className={`text-xs ${SOURCE_COLORS[p.source] ?? ""}`}>
            {p.source}
          </Badge>
        </td>
        <td className="p-3">
          {p.client_id ? (
            <span className="text-xs text-muted-foreground">{clientName(p.client_id)}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="p-3">
          {!showActions && (
            <div className="flex items-center gap-1 justify-end">
              {p.clicked_at ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <MousePointerClick className="w-3.5 h-3.5 text-emerald-600" />
                    </TooltipTrigger>
                    <TooltipContent>Clicked a link {format(new Date(p.clicked_at), "MMM d")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : p.opened_at ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Eye className="w-3.5 h-3.5 text-blue-500" />
                    </TooltipTrigger>
                    <TooltipContent>Opened an email {format(new Date(p.opened_at), "MMM d")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
              <Button
                size="sm" variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() => openThread(p)}
                title="View email thread"
              >
                <Mail className="w-3.5 h-3.5" />
              </Button>
              <Badge variant="outline" className={`text-xs ${STATUS_COLORS[p.status] ?? ""}`}>
                {p.status}
              </Badge>
              {(p.status === "nurture" || p.status === "pending") && (
                <>
                  <Button
                    size="sm" variant="ghost"
                    className="h-6 px-1.5 text-xs text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                    disabled={actionIds.has(p.id)}
                    onClick={() => updateStatus([p.id], "replied")}
                    title="They responded — stop the sequence"
                  >
                    Replied
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    className="h-6 px-1.5 text-xs text-yellow-600 hover:bg-yellow-50 hover:text-yellow-700"
                    disabled={actionIds.has(p.id)}
                    onClick={() => updateStatus([p.id], "paused")}
                    title="Put outreach on hold"
                  >
                    Pause
                  </Button>
                </>
              )}
              {p.status === "paused" && (
                <Button
                  size="sm" variant="ghost"
                  className="h-6 px-1.5 text-xs text-purple-600 hover:bg-purple-50 hover:text-purple-700"
                  disabled={actionIds.has(p.id)}
                  onClick={() => updateStatus([p.id], "nurture")}
                  title="Resume outreach where it left off"
                >
                  Resume
                </Button>
              )}
            </div>
          )}
          {showActions && (
            <span className="text-xs text-muted-foreground">
              {format(new Date(p.created_at), "MMM d")}
            </span>
          )}
        </td>
        {showActions && (
          <td className="p-3 text-right">
            <div className="flex items-center gap-1 justify-end">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-green-600 hover:bg-green-50 hover:text-green-700"
                        disabled={actionIds.has(p.id) || !canApprove}
                        onClick={() => updateStatus([p.id], "pending")}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!canApprove && (
                    <TooltipContent>Add an email address before approving</TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-red-500 hover:bg-red-50 hover:text-red-600"
                disabled={actionIds.has(p.id)}
                onClick={() => updateStatus([p.id], "rejected")}
              >
                <XCircle className="w-4 h-4 mr-1" />
                Reject
              </Button>
            </div>
          </td>
        )}
      </tr>
    );
  };

  const TableHead = ({ showActions }: { showActions: boolean }) => (
    <thead>
      <tr className="border-b bg-muted/30">
        {showActions && (
          <th className="p-2 w-8">
            <Checkbox
              checked={queuePage.length > 0 && queuePage.every(p => selected.has(p.id))}
              onCheckedChange={() => toggleAll(queuePage)}
            />
          </th>
        )}
        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Business</th>
        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Fit</th>
        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Website</th>
        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Contact</th>
        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Source</th>
        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Client</th>
        <th className="p-3 text-left text-xs font-medium text-muted-foreground">
          {showActions ? "Found" : "Status"}
        </th>
        {showActions && (
          <th className="p-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
        )}
      </tr>
    </thead>
  );

  const Pagination = ({
    page: pg, total, onChange,
  }: { page: number; total: number; onChange: (p: number) => void }) =>
    total > 1 ? (
      <div className="flex items-center justify-between mt-4">
        <span className="text-sm text-muted-foreground">
          Page {pg} of {total}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={pg === 1} onClick={() => onChange(pg - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" disabled={pg === total} onClick={() => onChange(pg + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    ) : null;

  const statsRow = [
    { label: "Review Queue", value: reviewQueue.length, icon: Clock, color: "text-amber-600" },
    { label: "In Nurture",   value: prospects.filter(p => p.status === "nurture").length,   icon: TrendingUp, color: "text-purple-600" },
    { label: "Converted",    value: prospects.filter(p => p.status === "converted").length, icon: Users,      color: "text-green-600" },
    { label: "Total",        value: prospects.length, icon: Radar, color: "text-blue-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statsRow.map(s => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-3">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <div>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Discovery runner */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radar className="w-4 h-4 text-orange-500" />
            Run Discovery
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Client</Label>
              <Select
                value={discClientId}
                onValueChange={v => { setDiscClientId(v); setIcpInfo(null); setIcpMismatch(null); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Source</Label>
              <Select value={discSource} onValueChange={v => { setDiscSource(v as "maps" | "web"); setIcpMismatch(null); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maps">Google Maps (local)</SelectItem>
                  <SelectItem value="web">AI web research (B2B)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{discSource === "maps" ? "Business type" : "Focus (optional)"}</Label>
              <Input
                placeholder={discSource === "maps" ? "e.g. HVAC companies" : "e.g. fintech compliance teams"}
                value={discQuery}
                onChange={e => { setDiscQuery(e.target.value); setIcpMismatch(null); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{discSource === "maps" ? "Location" : "Geography (optional)"}</Label>
              <Input
                placeholder={discSource === "maps" ? "e.g. Toronto, ON" : "defaults to ICP geography"}
                value={discLocation}
                onChange={e => { setDiscLocation(e.target.value); setIcpMismatch(null); }}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            <Button
              variant="outline"
              onClick={suggestFromIcp}
              disabled={suggesting || !discClientId}
              className="gap-2"
            >
              {suggesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              Suggest
            </Button>
            <Button
              onClick={runDiscovery}
              disabled={discovering || !discClientId || (discSource === "maps" && (!discQuery || !discLocation))}
              className={`gap-2 ${icpMismatch ? "bg-amber-600 hover:bg-amber-700" : ""}`}
            >
              {discovering ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Radar className="w-4 h-4" />
              )}
              {discovering ? "Scanning..." : icpMismatch ? "Discover anyway" : "Discover"}
            </Button>
          </div>

          {icpMismatch && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                This search doesn't match the client's ICP: {icpMismatch}{" "}
                Click "Discover anyway" to override.
              </span>
            </div>
          )}

          {icpInfo && (
            <div className="mt-3 space-y-2">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Ideal customer:</span> {icpInfo.summary}
              </div>
              {!icpInfo.maps_suitable && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    This client's customers aren't local businesses — switched the source to
                    AI web research, which finds companies matching the ICP anywhere.
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {icpInfo.suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs text-orange-800 hover:bg-orange-100 transition-colors"
                    onClick={() => { setDiscQuery(s.query); setDiscLocation(s.location); setIcpMismatch(null); }}
                  >
                    {s.query} · {s.location}
                  </button>
                ))}
              </div>
            </div>
          )}

          {discResult && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <Badge className="bg-green-100 text-green-700 border-green-200">
                {discResult.discovered} new
              </Badge>
              <span className="text-muted-foreground">
                {discResult.skipped} duplicates · {discResult.noWebsite} without a website skipped
              </span>
              {discResult.discovered > 0 && (
                <span className="text-muted-foreground">→ added to review queue below</span>
              )}
              {discResult.discovered > 0 && !discResult.emailEnrichment && (
                <span className="flex items-center gap-1 text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Email enrichment is off (no Hunter.io key) — emails must be entered manually before approving.
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review queue + all prospects */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search prospects..."
            value={filterSearch}
            onChange={e => { setFilterSearch(e.target.value); setPageQueue(1); setPageAll(1); }}
            className="pl-9"
          />
        </div>
        <Select value={filterClient} onValueChange={v => { setFilterClient(v); setPageQueue(1); setPageAll(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clients.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={loadProspects} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue" className="gap-2">
            Review Queue
            {reviewQueue.length > 0 && (
              <Badge className="ml-1 bg-amber-100 text-amber-800 text-xs">
                {reviewQueue.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All Prospects</TabsTrigger>
        </TabsList>

        {/* REVIEW QUEUE */}
        <TabsContent value="queue">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {filteredQueue.length} awaiting review
              </CardTitle>
              {selected.size > 0 && (() => {
                const selectedProspects = filteredQueue.filter(p => selected.has(p.id));
                const approvable = selectedProspects.filter(p =>
                  (p.email && p.email.includes("@")) || (emailDrafts[p.id] ?? "").includes("@")
                );
                const skipped = selectedProspects.length - approvable.length;
                return (
                <div className="flex gap-2">
                  <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          size="sm"
                          className="gap-1 bg-green-600 hover:bg-green-700 text-white"
                          disabled={approvable.length === 0}
                          onClick={() => {
                            updateStatus(approvable.map(p => p.id), "pending");
                            if (skipped > 0) {
                              toast({ title: `${skipped} skipped — add an email before approving`, variant: "destructive" });
                            }
                          }}
                        >
                          <CheckCircle className="w-4 h-4" />
                          Approve {approvable.length}{skipped > 0 ? ` (${skipped} need email)` : ""}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {approvable.length === 0 && (
                      <TooltipContent>Add an email address before approving</TooltipContent>
                    )}
                  </Tooltip>
                  </TooltipProvider>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-red-500 hover:text-red-600 hover:border-red-300"
                    onClick={() => updateStatus(Array.from(selected), "rejected")}
                  >
                    <XCircle className="w-4 h-4" />
                    Reject {selected.size}
                  </Button>
                </div>
                );
              })()}
              {selected.size === 0 && filteredQueue.length > 0 && (() => {
                const approvable = filteredQueue.filter(p =>
                  (p.email && p.email.includes("@")) || (emailDrafts[p.id] ?? "").includes("@")
                );
                return approvable.length > 0 ? (
                  <Button
                    size="sm"
                    className="gap-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => updateStatus(approvable.map(p => p.id), "pending")}
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve All {approvable.length < filteredQueue.length ? `(${approvable.length} with email)` : ""}
                  </Button>
                ) : null;
              })()}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <TableHead showActions={true} />
                  <tbody>
                    {queuePage.map(p => (
                      <ProspectRow key={p.id} p={p} showActions={true} />
                    ))}
                    {filteredQueue.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-muted-foreground">
                          {loading ? "Loading..." : "No prospects awaiting review"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-4 pb-4">
                <Pagination page={pageQueue} total={totalQueuePages} onChange={setPageQueue} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ALL PROSPECTS */}
        <TabsContent value="all">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {allFiltered.length} prospects
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <TableHead showActions={false} />
                  <tbody>
                    {allPage.map(p => (
                      <ProspectRow key={p.id} p={p} showActions={false} />
                    ))}
                    {allFiltered.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-muted-foreground">
                          {loading ? "Loading..." : "No prospects found"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-4 pb-4">
                <Pagination page={pageAll} total={totalAllPages} onChange={setPageAll} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!threadProspect} onOpenChange={(open) => { if (!open) setThreadProspect(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Email thread — {threadProspect?.name}</DialogTitle>
          </DialogHeader>
          {threadLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Sent</p>
                {threadData?.sent.length ? (
                  <div className="space-y-2">
                    {threadData.sent.map((e, i) => (
                      <div key={i} className="text-sm border rounded p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{e.subject}</span>
                          <Badge variant="outline" className="text-xs">{e.status}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(e.sent_at), "MMM d, yyyy h:mm a")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No emails sent yet.</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Next scheduled</p>
                {threadData?.scheduled.length ? (
                  <div className="space-y-2">
                    {threadData.scheduled.map((e, i) => (
                      <div key={i} className="text-sm border rounded p-2 border-dashed">
                        <span className="font-medium">{e.subject}</span>
                        <br />
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(e.scheduled_for), "MMM d, yyyy h:mm a")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
