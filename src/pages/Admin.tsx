import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Lock, Trash2, RefreshCw, Users, FileText, Eye, Download, Search, CalendarIcon, X, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { GapAnalysisDetailModal } from "@/components/admin/GapAnalysisDetailModal";
import { cn } from "@/lib/utils";

interface ContactSubmission {
  id: string;
  first_name: string;
  last_name: string;
  business_name: string;
  email: string;
  website_url: string | null;
  marketing_challenge: string | null;
  status: string;
  created_at: string;
}

interface GapAnalysisData {
  id: string;
  first_name: string;
  last_name: string;
  business_name: string;
  email: string;
  phone: string | null;
  website_url: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  top_business_goals?: string | null;
  primary_customer_sources?: string | null;
  top_competitors?: string | null;
  unique_differentiator?: string | null;
  has_seasonality?: boolean | null;
  seasonality_details?: string | null;
  avg_customer_lifetime_value?: string | null;
  growth_satisfaction?: number | null;
  website_last_updated?: string | null;
  tracks_website_conversions?: boolean | null;
  monthly_website_leads?: number | null;
  priority_improvement?: string | null;
  investing_in_seo?: boolean | null;
  ranking_for_keywords?: boolean | null;
  knows_organic_traffic?: boolean | null;
  monthly_organic_traffic?: number | null;
  tracking_keyword_rankings?: boolean | null;
  running_paid_ads?: boolean | null;
  ad_platforms?: string | null;
  monthly_ad_spend?: string | null;
  ad_manager?: string | null;
  ads_match_customer_intent?: boolean | null;
  satisfied_with_ad_performance?: boolean | null;
  runs_retargeting?: boolean | null;
  ads_use_landing_pages?: boolean | null;
  cost_per_lead?: string | null;
  ad_performance_notes?: string | null;
  uses_email_automation?: boolean | null;
  uses_sms_followups?: boolean | null;
  has_crm?: boolean | null;
  crm_name?: string | null;
  crm_tracks_all_inbound?: boolean | null;
  has_segmentation_drip?: boolean | null;
  has_abandoned_followups?: boolean | null;
  uses_online_scheduling?: boolean | null;
  lead_response_time?: string | null;
  avg_time_to_quote?: string | null;
  close_rate?: string | null;
  common_objections?: string | null;
  where_prospects_lost?: string | null;
  asks_for_reviews?: boolean | null;
  monthly_new_reviews?: number | null;
  has_reputation_tool?: boolean | null;
  reputation_tool_name?: string | null;
  emails_past_customers?: boolean | null;
  repeat_customer_rate?: string | null;
  has_loyalty_referral_program?: boolean | null;
  has_post_purchase_followup?: boolean | null;
  uses_google_analytics?: boolean | null;
  knows_best_lead_sources?: boolean | null;
  conversion_tracking_method?: string | null;
  kpis_tracked?: string | null;
  kpi_tracking_frequency?: string | null;
  analytics_review_frequency?: string | null;
  data_accuracy_confidence?: string | null;
  does_ab_testing?: boolean | null;
  who_handles_marketing?: string | null;
  weekly_team_hours?: string | null;
  monthly_marketing_budget?: string | null;
  marketing_to_offload?: string | null;
  automation_wishlist?: string | null;
  past_marketing_failures?: string | null;
  reason_seeking_help?: string | null;
  biggest_marketing_frustration?: string | null;
  suffering_from_weak_digital?: string | null;
  biggest_agency_fear?: string | null;
  fastest_impact?: string | null;
  what_makes_it_worth_it?: string | null;
  success_definition_3mo?: string | null;
  success_definition_6mo?: string | null;
  success_definition_12mo?: string | null;
  additional_notes?: string | null;
}

const Admin = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [storedPassword, setStoredPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [contacts, setContacts] = useState<ContactSubmission[]>([]);
  const [gapAnalyses, setGapAnalyses] = useState<GapAnalysisData[]>([]);
  const [selectedGapAnalysis, setSelectedGapAnalysis] = useState<GapAnalysisData | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactStatusFilter, setContactStatusFilter] = useState("all");
  const [contactDateFrom, setContactDateFrom] = useState<Date | undefined>();
  const [contactDateTo, setContactDateTo] = useState<Date | undefined>();
  const [gapSearch, setGapSearch] = useState("");
  const [gapStatusFilter, setGapStatusFilter] = useState("all");
  const [gapDateFrom, setGapDateFrom] = useState<Date | undefined>();
  const [gapDateTo, setGapDateTo] = useState<Date | undefined>();
  const [contactPage, setContactPage] = useState(1);
  const [gapPage, setGapPage] = useState(1);
  const pageSize = 10;
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [selectedGaps, setSelectedGaps] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [contactSort, setContactSort] = useState<{ column: string; direction: 'asc' | 'desc' }>({ column: 'created_at', direction: 'desc' });
  const [gapSort, setGapSort] = useState<{ column: string; direction: 'asc' | 'desc' }>({ column: 'created_at', direction: 'desc' });

  const filteredContacts = useMemo(() => {
    const filtered = contacts.filter(contact => {
      const matchesSearch = contactSearch === "" || 
        `${contact.first_name} ${contact.last_name}`.toLowerCase().includes(contactSearch.toLowerCase()) ||
        contact.email.toLowerCase().includes(contactSearch.toLowerCase()) ||
        contact.business_name.toLowerCase().includes(contactSearch.toLowerCase());
      const matchesStatus = contactStatusFilter === "all" || contact.status === contactStatusFilter;
      const contactDate = new Date(contact.created_at);
      const matchesDateFrom = !contactDateFrom || contactDate >= contactDateFrom;
      const matchesDateTo = !contactDateTo || contactDate <= new Date(contactDateTo.getTime() + 86400000);
      return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo;
    });
    return filtered.sort((a, b) => {
      const col = contactSort.column;
      let aVal: string = col === 'name' ? `${a.first_name} ${a.last_name}` : String(a[col as keyof ContactSubmission] ?? '');
      let bVal: string = col === 'name' ? `${b.first_name} ${b.last_name}` : String(b[col as keyof ContactSubmission] ?? '');
      const comparison = aVal.localeCompare(bVal);
      return contactSort.direction === 'asc' ? comparison : -comparison;
    });
  }, [contacts, contactSearch, contactStatusFilter, contactDateFrom, contactDateTo, contactSort]);

  const filteredGapAnalyses = useMemo(() => {
    const filtered = gapAnalyses.filter(gap => {
      const matchesSearch = gapSearch === "" || 
        `${gap.first_name} ${gap.last_name}`.toLowerCase().includes(gapSearch.toLowerCase()) ||
        gap.email.toLowerCase().includes(gapSearch.toLowerCase()) ||
        gap.business_name.toLowerCase().includes(gapSearch.toLowerCase());
      const matchesStatus = gapStatusFilter === "all" || gap.status === gapStatusFilter;
      const gapDate = new Date(gap.created_at);
      const matchesDateFrom = !gapDateFrom || gapDate >= gapDateFrom;
      const matchesDateTo = !gapDateTo || gapDate <= new Date(gapDateTo.getTime() + 86400000);
      return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo;
    });
    return filtered.sort((a, b) => {
      const col = gapSort.column;
      let aVal: string = col === 'name' ? `${a.first_name} ${a.last_name}` : String(a[col as keyof GapAnalysisData] ?? '');
      let bVal: string = col === 'name' ? `${b.first_name} ${b.last_name}` : String(b[col as keyof GapAnalysisData] ?? '');
      const comparison = aVal.localeCompare(bVal);
      return gapSort.direction === 'asc' ? comparison : -comparison;
    });
  }, [gapAnalyses, gapSearch, gapStatusFilter, gapDateFrom, gapDateTo, gapSort]);

  const handleContactSort = (column: string) => {
    setContactSort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleGapSort = (column: string) => {
    setGapSort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ column, sort }: { column: string; sort: { column: string; direction: 'asc' | 'desc' } }) => {
    if (sort.column !== column) return <ArrowUpDown className="w-4 h-4 ml-1 opacity-50" />;
    return sort.direction === 'asc' ? <ArrowUp className="w-4 h-4 ml-1" /> : <ArrowDown className="w-4 h-4 ml-1" />;
  };

  // Reset page when filters change
  useMemo(() => { setContactPage(1); }, [contactSearch, contactStatusFilter, contactDateFrom, contactDateTo]);
  useMemo(() => { setGapPage(1); }, [gapSearch, gapStatusFilter, gapDateFrom, gapDateTo]);

  const contactTotalPages = Math.ceil(filteredContacts.length / pageSize);
  const gapTotalPages = Math.ceil(filteredGapAnalyses.length / pageSize);
  const paginatedContacts = filteredContacts.slice((contactPage - 1) * pageSize, contactPage * pageSize);
  const paginatedGapAnalyses = filteredGapAnalyses.slice((gapPage - 1) * pageSize, gapPage * pageSize);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setStoredPassword(password);
    setIsAuthenticated(true);
    fetchData(password);
  };

  const fetchData = async (pwd: string) => {
    setIsLoading(true);
    try {
      const [contactsRes, gapRes] = await Promise.all([
        supabase.functions.invoke("admin", {
          body: { action: "list", table: "contact_submissions", password: pwd },
        }),
        supabase.functions.invoke("admin", {
          body: { action: "list", table: "gap_analysis_submissions", password: pwd },
        }),
      ]);

      if (contactsRes.error) throw new Error(contactsRes.error.message);
      if (gapRes.error) throw new Error(gapRes.error.message);

      if (contactsRes.data?.error === "Unauthorized" || gapRes.data?.error === "Unauthorized") {
        setIsAuthenticated(false);
        toast({ title: "Invalid password", variant: "destructive" });
        return;
      }

      setContacts(contactsRes.data?.data || []);
      setGapAnalyses(gapRes.data?.data || []);
    } catch (error: any) {
      toast({ title: "Error fetching data", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (table: string, id: string, status: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("admin", {
        body: { action: "update", table, id, data: { status }, password: storedPassword },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Status updated" });
      fetchData(storedPassword);
    } catch (error: any) {
      toast({ title: "Error updating status", description: error.message, variant: "destructive" });
    }
  };

  const deleteRecord = async (table: string, id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("admin", {
        body: { action: "delete", table, id, password: storedPassword },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Record deleted" });
      fetchData(storedPassword);
    } catch (error: any) {
      toast({ title: "Error deleting record", description: error.message, variant: "destructive" });
    }
  };

  const bulkDelete = async (table: string, ids: string[]) => {
    setIsBulkDeleting(true);
    try {
      await Promise.all(ids.map(id => 
        supabase.functions.invoke("admin", {
          body: { action: "delete", table, id, password: storedPassword },
        })
      ));
      toast({ title: `${ids.length} records deleted` });
      if (table === "contact_submissions") {
        setSelectedContacts(new Set());
      } else {
        setSelectedGaps(new Set());
      }
      fetchData(storedPassword);
    } catch (error: any) {
      toast({ title: "Error deleting records", description: error.message, variant: "destructive" });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const toggleContactSelection = (id: string) => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGapSelection = (id: string) => {
    setSelectedGaps(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllContacts = () => {
    if (selectedContacts.size === paginatedContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(paginatedContacts.map(c => c.id)));
    }
  };

  const toggleAllGaps = () => {
    if (selectedGaps.size === paginatedGapAnalyses.length) {
      setSelectedGaps(new Set());
    } else {
      setSelectedGaps(new Set(paginatedGapAnalyses.map(g => g.id)));
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      new: "bg-blue-100 text-blue-800",
      contacted: "bg-yellow-100 text-yellow-800",
      qualified: "bg-green-100 text-green-800",
      converted: "bg-purple-100 text-purple-800",
      submitted: "bg-blue-100 text-blue-800",
      reviewed: "bg-yellow-100 text-yellow-800",
      completed: "bg-green-100 text-green-800",
    };
    return <Badge className={colors[status] || "bg-gray-100 text-gray-800"}>{status}</Badge>;
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(","),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          if (value === null || value === undefined) return "";
          const stringValue = String(value).replace(/"/g, '""');
          return stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n") 
            ? `"${stringValue}"` 
            : stringValue;
        }).join(",")
      )
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Export complete" });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-20 min-h-[80vh] flex items-center justify-center">
          <Card className="w-full max-w-md mx-4">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>Admin Access</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <Input
                  type="password"
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Button type="submit" className="w-full">
                  Access Dashboard
                </Button>
              </form>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-20 pb-12">
        <div className="container-wide mx-auto section-padding">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-display font-semibold">Admin Dashboard</h1>
            <Button variant="outline" onClick={() => fetchData(storedPassword)} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{contacts.length}</p>
                    <p className="text-muted-foreground">Contact Submissions</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{gapAnalyses.length}</p>
                    <p className="text-muted-foreground">Gap Analysis Submissions</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="contacts" className="space-y-4">
            <TabsList>
              <TabsTrigger value="contacts">Contact Submissions</TabsTrigger>
              <TabsTrigger value="gap-analysis">Gap Analysis</TabsTrigger>
            </TabsList>

            <TabsContent value="contacts">
              <Card>
                <CardHeader className="flex flex-col gap-4 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <CardTitle className="text-lg">Contact Submissions</CardTitle>
                      {selectedContacts.size > 0 && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={isBulkDeleting}>
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete {selectedContacts.size} selected
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {selectedContacts.size} submissions?</AlertDialogTitle>
                              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => bulkDelete("contact_submissions", Array.from(selectedContacts))} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                    <Button variant="outline" size="default" onClick={() => exportToCSV(filteredContacts, "contact_submissions")}>
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search name, email, business..."
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                        className="pl-9 w-full sm:w-56"
                      />
                    </div>
                    <Select value={contactStatusFilter} onValueChange={setContactStatusFilter}>
                      <SelectTrigger className="w-full sm:w-32">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="contacted">Contacted</SelectItem>
                        <SelectItem value="qualified">Qualified</SelectItem>
                        <SelectItem value="converted">Converted</SelectItem>
                      </SelectContent>
                    </Select>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full sm:w-[130px] justify-start text-left font-normal", !contactDateFrom && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {contactDateFrom ? format(contactDateFrom, "MMM d, yyyy") : "From"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={contactDateFrom} onSelect={setContactDateFrom} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full sm:w-[130px] justify-start text-left font-normal", !contactDateTo && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {contactDateTo ? format(contactDateTo, "MMM d, yyyy") : "To"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={contactDateTo} onSelect={setContactDateTo} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    {(contactDateFrom || contactDateTo) && (
                      <Button variant="ghost" size="icon" onClick={() => { setContactDateFrom(undefined); setContactDateTo(undefined); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-4 w-12">
                            <Checkbox checked={paginatedContacts.length > 0 && selectedContacts.size === paginatedContacts.length} onCheckedChange={toggleAllContacts} />
                          </th>
                          <th className="text-left p-4 font-medium cursor-pointer hover:bg-muted/70" onClick={() => handleContactSort('name')}>
                            <div className="flex items-center">Name<SortIcon column="name" sort={contactSort} /></div>
                          </th>
                          <th className="text-left p-4 font-medium cursor-pointer hover:bg-muted/70" onClick={() => handleContactSort('business_name')}>
                            <div className="flex items-center">Business<SortIcon column="business_name" sort={contactSort} /></div>
                          </th>
                          <th className="text-left p-4 font-medium cursor-pointer hover:bg-muted/70" onClick={() => handleContactSort('email')}>
                            <div className="flex items-center">Email<SortIcon column="email" sort={contactSort} /></div>
                          </th>
                          <th className="text-left p-4 font-medium cursor-pointer hover:bg-muted/70" onClick={() => handleContactSort('status')}>
                            <div className="flex items-center">Status<SortIcon column="status" sort={contactSort} /></div>
                          </th>
                          <th className="text-left p-4 font-medium cursor-pointer hover:bg-muted/70" onClick={() => handleContactSort('created_at')}>
                            <div className="flex items-center">Date<SortIcon column="created_at" sort={contactSort} /></div>
                          </th>
                          <th className="text-left p-4 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {paginatedContacts.map((contact) => (
                          <tr key={contact.id} className={cn("hover:bg-muted/30", selectedContacts.has(contact.id) && "bg-muted/20")}>
                            <td className="p-4">
                              <Checkbox checked={selectedContacts.has(contact.id)} onCheckedChange={() => toggleContactSelection(contact.id)} />
                            </td>
                            <td className="p-4">{contact.first_name} {contact.last_name}</td>
                            <td className="p-4">{contact.business_name}</td>
                            <td className="p-4">{contact.email}</td>
                            <td className="p-4">
                              <Select
                                value={contact.status}
                                onValueChange={(value) => updateStatus("contact_submissions", contact.id, value)}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="new">New</SelectItem>
                                  <SelectItem value="contacted">Contacted</SelectItem>
                                  <SelectItem value="qualified">Qualified</SelectItem>
                                  <SelectItem value="converted">Converted</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-4 text-muted-foreground">
                              {new Date(contact.created_at).toLocaleDateString()}
                            </td>
                            <td className="p-4">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="text-destructive">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete submission?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteRecord("contact_submissions", contact.id)}
                                      className="bg-destructive text-destructive-foreground"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </td>
                          </tr>
                        ))}
                        {paginatedContacts.length === 0 && (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-muted-foreground">
                              {contacts.length === 0 ? "No contact submissions yet" : "No results match your search"}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {contactTotalPages > 1 && (
                    <div className="flex items-center justify-between p-4 border-t">
                      <span className="text-sm text-muted-foreground">
                        Showing {(contactPage - 1) * pageSize + 1}-{Math.min(contactPage * pageSize, filteredContacts.length)} of {filteredContacts.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" onClick={() => setContactPage(p => Math.max(1, p - 1))} disabled={contactPage === 1}>
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-sm">Page {contactPage} of {contactTotalPages}</span>
                        <Button variant="outline" size="icon" onClick={() => setContactPage(p => Math.min(contactTotalPages, p + 1))} disabled={contactPage === contactTotalPages}>
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="gap-analysis">
              <Card>
                <CardHeader className="flex flex-col gap-4 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <CardTitle className="text-lg">Gap Analysis Submissions</CardTitle>
                      {selectedGaps.size > 0 && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={isBulkDeleting}>
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete {selectedGaps.size} selected
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {selectedGaps.size} submissions?</AlertDialogTitle>
                              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => bulkDelete("gap_analysis_submissions", Array.from(selectedGaps))} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                    <Button variant="outline" size="default" onClick={() => exportToCSV(filteredGapAnalyses, "gap_analysis_submissions")}>
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search name, email, business..."
                        value={gapSearch}
                        onChange={(e) => setGapSearch(e.target.value)}
                        className="pl-9 w-full sm:w-56"
                      />
                    </div>
                    <Select value={gapStatusFilter} onValueChange={setGapStatusFilter}>
                      <SelectTrigger className="w-full sm:w-32">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="reviewed">Reviewed</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full sm:w-[130px] justify-start text-left font-normal", !gapDateFrom && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {gapDateFrom ? format(gapDateFrom, "MMM d, yyyy") : "From"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={gapDateFrom} onSelect={setGapDateFrom} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full sm:w-[130px] justify-start text-left font-normal", !gapDateTo && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {gapDateTo ? format(gapDateTo, "MMM d, yyyy") : "To"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={gapDateTo} onSelect={setGapDateTo} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    {(gapDateFrom || gapDateTo) && (
                      <Button variant="ghost" size="icon" onClick={() => { setGapDateFrom(undefined); setGapDateTo(undefined); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-4 w-12">
                            <Checkbox checked={paginatedGapAnalyses.length > 0 && selectedGaps.size === paginatedGapAnalyses.length} onCheckedChange={toggleAllGaps} />
                          </th>
                          <th className="text-left p-4 font-medium cursor-pointer hover:bg-muted/70" onClick={() => handleGapSort('name')}>
                            <div className="flex items-center">Name<SortIcon column="name" sort={gapSort} /></div>
                          </th>
                          <th className="text-left p-4 font-medium cursor-pointer hover:bg-muted/70" onClick={() => handleGapSort('business_name')}>
                            <div className="flex items-center">Business<SortIcon column="business_name" sort={gapSort} /></div>
                          </th>
                          <th className="text-left p-4 font-medium cursor-pointer hover:bg-muted/70" onClick={() => handleGapSort('email')}>
                            <div className="flex items-center">Email<SortIcon column="email" sort={gapSort} /></div>
                          </th>
                          <th className="text-left p-4 font-medium cursor-pointer hover:bg-muted/70" onClick={() => handleGapSort('phone')}>
                            <div className="flex items-center">Phone<SortIcon column="phone" sort={gapSort} /></div>
                          </th>
                          <th className="text-left p-4 font-medium cursor-pointer hover:bg-muted/70" onClick={() => handleGapSort('status')}>
                            <div className="flex items-center">Status<SortIcon column="status" sort={gapSort} /></div>
                          </th>
                          <th className="text-left p-4 font-medium cursor-pointer hover:bg-muted/70" onClick={() => handleGapSort('created_at')}>
                            <div className="flex items-center">Date<SortIcon column="created_at" sort={gapSort} /></div>
                          </th>
                          <th className="text-left p-4 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {paginatedGapAnalyses.map((gap) => (
                          <tr key={gap.id} className={cn("hover:bg-muted/30", selectedGaps.has(gap.id) && "bg-muted/20")}>
                            <td className="p-4">
                              <Checkbox checked={selectedGaps.has(gap.id)} onCheckedChange={() => toggleGapSelection(gap.id)} />
                            </td>
                            <td className="p-4">{gap.first_name} {gap.last_name}</td>
                            <td className="p-4">{gap.business_name}</td>
                            <td className="p-4">{gap.email}</td>
                            <td className="p-4">{gap.phone || "-"}</td>
                            <td className="p-4">
                              <Select
                                value={gap.status}
                                onValueChange={(value) => updateStatus("gap_analysis_submissions", gap.id, value)}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="submitted">Submitted</SelectItem>
                                  <SelectItem value="reviewed">Reviewed</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-4 text-muted-foreground">
                              {new Date(gap.created_at).toLocaleDateString()}
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedGapAnalysis(gap);
                                    setIsDetailModalOpen(true);
                                  }}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-destructive">
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete submission?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteRecord("gap_analysis_submissions", gap.id)}
                                        className="bg-destructive text-destructive-foreground"
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {paginatedGapAnalyses.length === 0 && (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-muted-foreground">
                              {gapAnalyses.length === 0 ? "No gap analysis submissions yet" : "No results match your search"}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {gapTotalPages > 1 && (
                    <div className="flex items-center justify-between p-4 border-t">
                      <span className="text-sm text-muted-foreground">
                        Showing {(gapPage - 1) * pageSize + 1}-{Math.min(gapPage * pageSize, filteredGapAnalyses.length)} of {filteredGapAnalyses.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" onClick={() => setGapPage(p => Math.max(1, p - 1))} disabled={gapPage === 1}>
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-sm">Page {gapPage} of {gapTotalPages}</span>
                        <Button variant="outline" size="icon" onClick={() => setGapPage(p => Math.min(gapTotalPages, p + 1))} disabled={gapPage === gapTotalPages}>
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <GapAnalysisDetailModal
          data={selectedGapAnalysis}
          open={isDetailModalOpen}
          onOpenChange={setIsDetailModalOpen}
        />
      </main>
      <Footer />
    </div>
  );
};

export default Admin;
