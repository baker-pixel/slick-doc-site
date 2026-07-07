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
} from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

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
  client_id: string | null;
  created_at: string;
  approved_at: string | null;
}

const PAGE_SIZE = 15;

const STATUS_COLORS: Record<string, string> = {
  discovered: "bg-amber-100 text-amber-800 border-amber-200",
  pending:    "bg-blue-100 text-blue-800 border-blue-200",
  nurture:    "bg-purple-100 text-purple-800 border-purple-200",
  converted:  "bg-green-100 text-green-800 border-green-200",
  rejected:   "bg-gray-100 text-gray-600 border-gray-200",
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
  const [discResult, setDiscResult]     = useState<{ discovered: number; skipped: number } | null>(null);

  // Filters
  const [filterClient, setFilterClient] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [page, setPage] = useState(1);

  const loadClients = useCallback(async () => {
    const { data } = await supabase
      .from("client_accounts")
      .select("id, business_name")
      .eq("status", "active")
      .order("business_name");
    setClients(data ?? []);
  }, []);

  const loadProspects = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("prospects")
      .select("id, name, email, website_url, phone, city, business_type, source, status, gap_score, icp_fit_score, client_id, created_at, approved_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (filterClient !== "all") {
      query = query.eq("client_id", filterClient);
    }

    const { data, error } = await query;
    if (error) {
      toast({ title: "Error loading prospects", description: error.message, variant: "destructive" });
    }
    setProspects(data ?? []);
    setLoading(false);
  }, [filterClient]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    loadProspects();
    setPage(1);
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

    // Save any drafted emails before approving
    if (status === "pending") {
      const emailUpdates = ids
        .filter(id => emailDrafts[id]?.includes("@"))
        .map(id =>
          supabase.from("prospects").update({ email: emailDrafts[id] }).eq("id", id)
        );
      if (emailUpdates.length > 0) await Promise.all(emailUpdates);
    }

    const updates: Record<string, unknown> = { status };
    if (status === "pending") {
      updates.approved_at = new Date().toISOString();
      updates.approved_by = "admin";
    }
    const { error } = await supabase
      .from("prospects")
      .update(updates)
      .in("id", ids);
    ids.forEach(id => markAction(id, false));
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: status === "pending" ? `${ids.length} approved` : `${ids.length} rejected` });
      setSelected(new Set());
      setEmailDrafts({});
      loadProspects();
    }
  };

  const runDiscovery = async () => {
    if (!discClientId || !discQuery || !discLocation) {
      toast({ title: "Fill in all fields", variant: "destructive" });
      return;
    }
    setDiscovering(true);
    setDiscResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("discover-prospects", {
        body: { client_id: discClientId, query: discQuery, location: discLocation, max_results: 20, password: adminPassword },
      });
      if (error) throw error;
      setDiscResult({ discovered: data.discovered ?? 0, skipped: data.skipped_duplicates ?? 0 });
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

  // Derived lists
  const reviewQueue = prospects.filter(p => p.status === "discovered");

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

  const paginate = <T,>(arr: T[]) =>
    arr.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const queuePage  = paginate(filteredQueue);
  const allPage    = paginate(allFiltered);

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
            <Badge variant="outline" className={`text-xs ${STATUS_COLORS[p.status] ?? ""}`}>
              {p.status}
            </Badge>
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
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Client</Label>
              <Select value={discClientId} onValueChange={setDiscClientId}>
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
              <Label className="text-xs">Business type</Label>
              <Input
                placeholder="e.g. HVAC companies"
                value={discQuery}
                onChange={e => setDiscQuery(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Location</Label>
              <Input
                placeholder="e.g. Toronto, ON"
                value={discLocation}
                onChange={e => setDiscLocation(e.target.value)}
              />
            </div>
            <Button
              onClick={runDiscovery}
              disabled={discovering || !discClientId || !discQuery || !discLocation}
              className="gap-2"
            >
              {discovering ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Radar className="w-4 h-4" />
              )}
              {discovering ? "Scanning..." : "Discover"}
            </Button>
          </div>
          {discResult && (
            <div className="mt-3 flex items-center gap-3 text-sm">
              <Badge className="bg-green-100 text-green-700 border-green-200">
                {discResult.discovered} new
              </Badge>
              <span className="text-muted-foreground">
                {discResult.skipped} duplicates skipped
              </span>
              {discResult.discovered > 0 && (
                <span className="text-muted-foreground">→ added to review queue below</span>
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
            onChange={e => { setFilterSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={filterClient} onValueChange={v => { setFilterClient(v); setPage(1); }}>
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
              {selected.size > 0 && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="gap-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => updateStatus(Array.from(selected), "pending")}
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve {selected.size}
                  </Button>
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
              )}
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
                        <td colSpan={8} className="py-12 text-center text-muted-foreground">
                          {loading ? "Loading..." : "No prospects awaiting review"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-4 pb-4">
                <Pagination page={page} total={totalQueuePages} onChange={setPage} />
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
                        <td colSpan={7} className="py-12 text-center text-muted-foreground">
                          {loading ? "Loading..." : "No prospects found"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-4 pb-4">
                <Pagination page={page} total={totalAllPages} onChange={setPage} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
