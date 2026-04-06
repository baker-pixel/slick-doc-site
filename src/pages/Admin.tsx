import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Lock, Trash2, RefreshCw, Eye, Download, Search, CalendarIcon, X, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, HelpCircle } from "lucide-react";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AdminSidebar, type AdminSection } from "@/components/admin/core/AdminSidebar";
import { AdminStatsCards } from "@/components/admin/core/AdminStatsCards";
import { AdminAnalyticsSection } from "@/components/admin/core/AdminAnalyticsSection";
import { AdminOnboarding } from "@/components/admin/core/AdminOnboarding";
import { QuickStartChecklist } from "@/components/admin/core/QuickStartChecklist";
import { EmailAdminPanel } from "@/components/admin/email/EmailAdminPanel";
import { GapAnalysisDetailModal } from "@/components/admin/sales/GapAnalysisDetailModal";
import { ClientManagementPanel } from "@/components/admin/clients/ClientManagementPanel";
import { ClientOnboardingChecklist } from "@/components/admin/clients/ClientOnboardingChecklist";
import { SOPManagementPanel } from "@/components/admin/workflow/SOPManagementPanel";
import { AutomationJobsPanel } from "@/components/admin/workflow/AutomationJobsPanel";
import { AutomationControlCenter } from "@/components/admin/workflow/AutomationControlCenter";
import { ContentReviewPanel } from "@/components/admin/content/ContentReviewPanel";
import { ReportsReviewPanel } from "@/components/admin/content/ReportsReviewPanel";
import { EmailSequencesPanel } from "@/components/admin/email/EmailSequencesPanel";
import { EmailTemplatesPanel } from "@/components/admin/email/EmailTemplatesPanel";
import { CampaignSenderPanel } from "@/components/admin/email/CampaignSenderPanel";
import { QuickActionsPanel } from "@/components/admin/core/QuickActionsPanel";
import { ContentCalendarPanel } from "@/components/admin/content/ContentCalendarPanel";
import PipelineDashboard from "@/components/admin/sales/PipelineDashboard";
import AutomationAlertsPanel from "@/components/admin/workflow/AutomationAlertsPanel";
import ClientDocumentsPanel from "@/components/admin/clients/ClientDocumentsPanel";
import ClientMessagesAdminPanel from "@/components/admin/clients/ClientMessagesAdminPanel";
import ClientMeetingsAdminPanel from "@/components/admin/clients/ClientMeetingsAdminPanel";
import ClientRequestsAdminPanel from "@/components/admin/clients/ClientRequestsAdminPanel";
import BrandAssetsAdminPanel from "@/components/admin/content/BrandAssetsAdminPanel";
import TeamDirectoryPanel from "@/components/admin/misc/TeamDirectoryPanel";
import DeliverablesAdminPanel from "@/components/admin/content/DeliverablesAdminPanel";
import { ServiceAgreementsPanel } from "@/components/admin/sales/ServiceAgreementsPanel";
import { ClientAnalyticsAdminPanel } from "@/components/admin/clients/ClientAnalyticsAdminPanel";
import { ClientInvoicesAdminPanel } from "@/components/admin/clients/ClientInvoicesAdminPanel";
import { ClientProjectsAdminPanel } from "@/components/admin/clients/ClientProjectsAdminPanel";
import { AdminSettingsPanel } from "@/components/admin/core/AdminSettingsPanel";
import { ActivityFeedAdminPanel } from "@/components/admin/misc/ActivityFeedAdminPanel";
import { TaskTemplatesPanel } from "@/components/admin/workflow/TaskTemplatesPanel";
import { ClientTasksPanel } from "@/components/admin/clients/ClientTasksPanel";
import { OnboardingAutomationPanel } from "@/components/admin/clients/OnboardingAutomationPanel";
import { IntegrationConfigPanel } from "@/components/admin/misc/IntegrationConfigPanel";
import SeoAnalysisDashboard from "@/components/admin/content/SeoAnalysisDashboard";
import { MarketingOSDashboard } from "@/components/admin/misc/MarketingOSDashboard";
import { GoogleReviewEngine } from "@/components/admin/content/GoogleReviewEngine";
import ClientWinNotifications from "@/components/admin/clients/ClientWinNotifications";
import LeadScoringPanel from "@/components/admin/sales/LeadScoringPanel";
import AIAdGenerator from "@/components/admin/content/AIAdGenerator";
import CaseStudyBuilderPanel from "@/components/admin/content/CaseStudyBuilderPanel";
import ClientHealthDashboard from "@/components/admin/clients/ClientHealthDashboard";
import WebsitePersonalizationPanel from "@/components/admin/misc/WebsitePersonalizationPanel";
import QualityAssurancePanel from "@/components/admin/misc/QualityAssurancePanel";
import BeforeAfterShowcasePanel from "@/components/admin/content/BeforeAfterShowcasePanel";
import SalesProposalPanel from "@/components/admin/sales/SalesProposalPanel";
import SocialMediaPostsPanel from "@/components/admin/content/SocialMediaPostsPanel";
import FeatureGuidePanel from "@/components/admin/core/FeatureGuidePanel";
import { ClientPhaseTracker } from "@/components/admin/clients/ClientPhaseTracker";
import ClientProgressTracker from "@/components/admin/clients/ClientProgressTracker";
import { ReviewWorkflowPanel } from "@/components/admin/workflow/ReviewWorkflowPanel";
import { ClientWorkflowPanel } from "@/components/admin/clients/ClientWorkflowPanel";
import { OrangeDoorDashboard } from "@/components/admin/misc/OrangeDoorDashboard";
import { AICopilotPanel } from "@/components/admin/core/AICopilotPanel";
import { AdminClientSelector } from "@/components/admin/clients/AdminClientSelector";
import { SelectedClientHeader } from "@/components/admin/clients/SelectedClientHeader";
import { UnifiedClientView } from "@/components/admin/clients/UnifiedClientView";
import { AdminHomeDashboard } from "@/components/admin/core/AdminHomeDashboard";
import { SOPCommandCenter } from "@/components/admin/workflow/SOPCommandCenter";
import { DailyDigestGenerator } from "@/components/admin/email/DailyDigestGenerator";
import { TeamPerformanceMetrics } from "@/components/admin/misc/TeamPerformanceMetrics";
import { WorkloadBalancer } from "@/components/admin/workflow/WorkloadBalancer";
import { SmartTaskQueue } from "@/components/admin/workflow/SmartTaskQueue";
import { TaskNotificationsPanel } from "@/components/admin/workflow/TaskNotificationsPanel";
import { cn } from "@/lib/utils";

interface SelectedClient {
  id: string;
  business_name: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  tier: string;
  status: string;
  industry: string | null;
}

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

interface PdfLead {
  id: string;
  email: string;
  first_name: string | null;
  source: string | null;
  created_at: string;
}

const Admin = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [storedPassword, setStoredPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [contacts, setContacts] = useState<ContactSubmission[]>([]);
  const [gapAnalyses, setGapAnalyses] = useState<GapAnalysisData[]>([]);
  const [pdfLeads, setPdfLeads] = useState<PdfLead[]>([]);
  const [selectedGapAnalysis, setSelectedGapAnalysis] = useState<GapAnalysisData | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<AdminSection>("home");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null);

  // Check if user has seen onboarding
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem("admin_onboarding_complete");
    if (!hasSeenOnboarding && isAuthenticated) {
      setShowOnboarding(true);
    }
  }, [isAuthenticated]);

  const handleOnboardingComplete = () => {
    localStorage.setItem("admin_onboarding_complete", "true");
    setShowOnboarding(false);
  };

  const handleOnboardingNavigate = (section: string) => {
    setActiveSection(section as AdminSection);
    setShowOnboarding(false);
    localStorage.setItem("admin_onboarding_complete", "true");
  };

  const restartOnboarding = () => {
    setShowOnboarding(true);
  };
  
  // Filtering and pagination state
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
  const [pdfPage, setPdfPage] = useState(1);
  const pageSize = 10;
  const [pdfSearch, setPdfSearch] = useState("");
  const [pdfSourceFilter, setPdfSourceFilter] = useState("all");
  const [pdfDateFrom, setPdfDateFrom] = useState<Date | undefined>();
  const [pdfDateTo, setPdfDateTo] = useState<Date | undefined>();
  const [selectedPdfLeads, setSelectedPdfLeads] = useState<Set<string>>(new Set());
  const [pdfSort, setPdfSort] = useState<{ column: string; direction: 'asc' | 'desc' }>({ column: 'created_at', direction: 'desc' });
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [selectedGaps, setSelectedGaps] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [contactSort, setContactSort] = useState<{ column: string; direction: 'asc' | 'desc' }>({ column: 'created_at', direction: 'desc' });
  const [gapSort, setGapSort] = useState<{ column: string; direction: 'asc' | 'desc' }>({ column: 'created_at', direction: 'desc' });
  const [reportPeriod, setReportPeriod] = useState<'week' | 'month'>('week');

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

  const filteredPdfLeads = useMemo(() => {
    const filtered = pdfLeads.filter(lead => {
      const matchesSearch = pdfSearch === "" || 
        (lead.first_name?.toLowerCase() || '').includes(pdfSearch.toLowerCase()) ||
        lead.email.toLowerCase().includes(pdfSearch.toLowerCase());
      const matchesSource = pdfSourceFilter === "all" || lead.source === pdfSourceFilter;
      const leadDate = new Date(lead.created_at);
      const matchesDateFrom = !pdfDateFrom || leadDate >= pdfDateFrom;
      const matchesDateTo = !pdfDateTo || leadDate <= new Date(pdfDateTo.getTime() + 86400000);
      return matchesSearch && matchesSource && matchesDateFrom && matchesDateTo;
    });
    return filtered.sort((a, b) => {
      const col = pdfSort.column;
      let aVal: string = String(a[col as keyof PdfLead] ?? '');
      let bVal: string = String(b[col as keyof PdfLead] ?? '');
      const comparison = aVal.localeCompare(bVal);
      return pdfSort.direction === 'asc' ? comparison : -comparison;
    });
  }, [pdfLeads, pdfSearch, pdfSourceFilter, pdfDateFrom, pdfDateTo, pdfSort]);

  const totalContactPages = Math.ceil(filteredContacts.length / pageSize);
  const totalGapPages = Math.ceil(filteredGapAnalyses.length / pageSize);
  const totalPdfPages = Math.ceil(filteredPdfLeads.length / pageSize);
  const paginatedContacts = filteredContacts.slice((contactPage - 1) * pageSize, contactPage * pageSize);
  const paginatedGapAnalyses = filteredGapAnalyses.slice((gapPage - 1) * pageSize, gapPage * pageSize);
  const paginatedPdfLeads = filteredPdfLeads.slice((pdfPage - 1) * pageSize, pdfPage * pageSize);

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

  const handlePdfSort = (column: string) => {
    setPdfSort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const togglePdfSelection = (id: string) => {
    setSelectedPdfLeads(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllPdfLeads = () => {
    if (selectedPdfLeads.size === paginatedPdfLeads.length) {
      setSelectedPdfLeads(new Set());
    } else {
      setSelectedPdfLeads(new Set(paginatedPdfLeads.map(l => l.id)));
    }
  };

  const SortIcon = ({ column, sort }: { column: string; sort: { column: string; direction: 'asc' | 'desc' } }) => {
    if (sort.column !== column) return <ArrowUpDown className="w-4 h-4 ml-1 opacity-50" />;
    return sort.direction === 'asc' ? <ArrowUp className="w-4 h-4 ml-1" /> : <ArrowDown className="w-4 h-4 ml-1" />;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin", {
        body: { action: "authenticate", password },
      });

      if (error) throw error;
      if (!data?.authenticated) throw new Error("Invalid password");

      setIsAuthenticated(true);
      setStoredPassword(password);
      // Store password in localStorage for child components to use
      localStorage.setItem("admin_password", password);
      toast({ title: "Access granted" });
      fetchData(password);
    } catch (error: any) {
      toast({ title: "Access denied", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchData = async (adminPassword: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin", {
        body: { action: "fetch", password: adminPassword },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setContacts(data.contacts || []);
      setGapAnalyses(data.gapAnalyses || []);
      setPdfLeads(data.pdfLeads || []);
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
      } else if (table === "gap_analysis_submissions") {
        setSelectedGaps(new Set());
      } else if (table === "pdf_leads") {
        setSelectedPdfLeads(new Set());
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

  // Login screen
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

  const renderContactsTable = () => (
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
                    <AlertDialogTitle>Confirm Bulk Deletion</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete {selectedContacts.size} contact(s)? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => bulkDelete("contact_submissions", Array.from(selectedContacts))}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => exportToCSV(filteredContacts, "contacts")}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={contactSearch}
              onChange={(e) => { setContactSearch(e.target.value); setContactPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={contactStatusFilter} onValueChange={(v) => { setContactStatusFilter(v); setContactPage(1); }}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="qualified">Qualified</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarIcon className="w-4 h-4" />
                {contactDateFrom ? format(contactDateFrom, 'MMM d') : 'From'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={contactDateFrom} onSelect={(d) => { setContactDateFrom(d); setContactPage(1); }} />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarIcon className="w-4 h-4" />
                {contactDateTo ? format(contactDateTo, 'MMM d') : 'To'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={contactDateTo} onSelect={(d) => { setContactDateTo(d); setContactPage(1); }} />
            </PopoverContent>
          </Popover>
          {(contactSearch || contactStatusFilter !== "all" || contactDateFrom || contactDateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setContactSearch(""); setContactStatusFilter("all"); setContactDateFrom(undefined); setContactDateTo(undefined); setContactPage(1); }}>
              <X className="w-4 h-4" /> Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left">
                  <Checkbox checked={selectedContacts.size === paginatedContacts.length && paginatedContacts.length > 0} onCheckedChange={toggleAllContacts} />
                </th>
                <th className="p-2 text-left cursor-pointer select-none" onClick={() => handleContactSort('name')}>
                  <div className="flex items-center">Name<SortIcon column="name" sort={contactSort} /></div>
                </th>
                <th className="p-2 text-left cursor-pointer select-none" onClick={() => handleContactSort('email')}>
                  <div className="flex items-center">Email<SortIcon column="email" sort={contactSort} /></div>
                </th>
                <th className="p-2 text-left cursor-pointer select-none" onClick={() => handleContactSort('business_name')}>
                  <div className="flex items-center">Business<SortIcon column="business_name" sort={contactSort} /></div>
                </th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left cursor-pointer select-none" onClick={() => handleContactSort('created_at')}>
                  <div className="flex items-center">Date<SortIcon column="created_at" sort={contactSort} /></div>
                </th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedContacts.map(contact => (
                <tr key={contact.id} className="border-b hover:bg-muted/50">
                  <td className="p-2"><Checkbox checked={selectedContacts.has(contact.id)} onCheckedChange={() => toggleContactSelection(contact.id)} /></td>
                  <td className="p-2 font-medium">{contact.first_name} {contact.last_name}</td>
                  <td className="p-2">{contact.email}</td>
                  <td className="p-2">{contact.business_name}</td>
                  <td className="p-2">
                    <Select value={contact.status} onValueChange={(v) => updateStatus("contact_submissions", contact.id, v)}>
                      <SelectTrigger className="w-[120px] h-8">{getStatusBadge(contact.status)}</SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="contacted">Contacted</SelectItem>
                        <SelectItem value="qualified">Qualified</SelectItem>
                        <SelectItem value="converted">Converted</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2 text-muted-foreground">{format(new Date(contact.created_at), 'MMM d, yyyy')}</td>
                  <td className="p-2 text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Contact</AlertDialogTitle>
                          <AlertDialogDescription>Are you sure you want to delete this contact? This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteRecord("contact_submissions", contact.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </td>
                </tr>
              ))}
              {paginatedContacts.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No contacts found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {totalContactPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-muted-foreground">Page {contactPage} of {totalContactPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={contactPage === 1} onClick={() => setContactPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="outline" size="sm" disabled={contactPage === totalContactPages} onClick={() => setContactPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderGapAnalysisTable = () => (
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
                    <AlertDialogTitle>Confirm Bulk Deletion</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete {selectedGaps.size} gap analysis submission(s)?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => bulkDelete("gap_analysis_submissions", Array.from(selectedGaps))}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => exportToCSV(filteredGapAnalyses, "gap_analyses")}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search gap analyses..."
              value={gapSearch}
              onChange={(e) => { setGapSearch(e.target.value); setGapPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={gapStatusFilter} onValueChange={(v) => { setGapStatusFilter(v); setGapPage(1); }}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          {(gapSearch || gapStatusFilter !== "all" || gapDateFrom || gapDateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setGapSearch(""); setGapStatusFilter("all"); setGapDateFrom(undefined); setGapDateTo(undefined); setGapPage(1); }}>
              <X className="w-4 h-4" /> Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left">
                  <Checkbox checked={selectedGaps.size === paginatedGapAnalyses.length && paginatedGapAnalyses.length > 0} onCheckedChange={toggleAllGaps} />
                </th>
                <th className="p-2 text-left cursor-pointer select-none" onClick={() => handleGapSort('name')}>
                  <div className="flex items-center">Name<SortIcon column="name" sort={gapSort} /></div>
                </th>
                <th className="p-2 text-left cursor-pointer select-none" onClick={() => handleGapSort('business_name')}>
                  <div className="flex items-center">Business<SortIcon column="business_name" sort={gapSort} /></div>
                </th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left cursor-pointer select-none" onClick={() => handleGapSort('created_at')}>
                  <div className="flex items-center">Date<SortIcon column="created_at" sort={gapSort} /></div>
                </th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedGapAnalyses.map(gap => (
                <tr key={gap.id} className="border-b hover:bg-muted/50">
                  <td className="p-2"><Checkbox checked={selectedGaps.has(gap.id)} onCheckedChange={() => toggleGapSelection(gap.id)} /></td>
                  <td className="p-2 font-medium">{gap.first_name} {gap.last_name}</td>
                  <td className="p-2">{gap.business_name}</td>
                  <td className="p-2">
                    <Select value={gap.status} onValueChange={(v) => updateStatus("gap_analysis_submissions", gap.id, v)}>
                      <SelectTrigger className="w-[120px] h-8">{getStatusBadge(gap.status)}</SelectTrigger>
                      <SelectContent>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="reviewed">Reviewed</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2 text-muted-foreground">{format(new Date(gap.created_at), 'MMM d, yyyy')}</td>
                  <td className="p-2 text-right space-x-1">
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedGapAnalysis(gap); setIsDetailModalOpen(true); }}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Gap Analysis</AlertDialogTitle>
                          <AlertDialogDescription>Are you sure you want to delete this gap analysis?</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteRecord("gap_analysis_submissions", gap.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </td>
                </tr>
              ))}
              {paginatedGapAnalyses.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No gap analyses found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {totalGapPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-muted-foreground">Page {gapPage} of {totalGapPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={gapPage === 1} onClick={() => setGapPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="outline" size="sm" disabled={gapPage === totalGapPages} onClick={() => setGapPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderPdfLeadsTable = () => (
    <Card>
      <CardHeader className="flex flex-col gap-4 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <CardTitle className="text-lg">PDF Download Leads</CardTitle>
            {selectedPdfLeads.size > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isBulkDeleting}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete {selectedPdfLeads.size} selected
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Bulk Deletion</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete {selectedPdfLeads.size} PDF lead(s)?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => bulkDelete("pdf_leads", Array.from(selectedPdfLeads))}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => exportToCSV(filteredPdfLeads, "pdf_leads")}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search PDF leads..."
              value={pdfSearch}
              onChange={(e) => { setPdfSearch(e.target.value); setPdfPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={pdfSourceFilter} onValueChange={(v) => { setPdfSourceFilter(v); setPdfPage(1); }}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="system_pdf">System PDF</SelectItem>
              <SelectItem value="gap_report">Gap Report</SelectItem>
            </SelectContent>
          </Select>
          {(pdfSearch || pdfSourceFilter !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => { setPdfSearch(""); setPdfSourceFilter("all"); setPdfPage(1); }}>
              <X className="w-4 h-4" /> Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left">
                  <Checkbox checked={selectedPdfLeads.size === paginatedPdfLeads.length && paginatedPdfLeads.length > 0} onCheckedChange={toggleAllPdfLeads} />
                </th>
                <th className="p-2 text-left cursor-pointer select-none" onClick={() => handlePdfSort('first_name')}>
                  <div className="flex items-center">Name<SortIcon column="first_name" sort={pdfSort} /></div>
                </th>
                <th className="p-2 text-left cursor-pointer select-none" onClick={() => handlePdfSort('email')}>
                  <div className="flex items-center">Email<SortIcon column="email" sort={pdfSort} /></div>
                </th>
                <th className="p-2 text-left cursor-pointer select-none" onClick={() => handlePdfSort('source')}>
                  <div className="flex items-center">Source<SortIcon column="source" sort={pdfSort} /></div>
                </th>
                <th className="p-2 text-left cursor-pointer select-none" onClick={() => handlePdfSort('created_at')}>
                  <div className="flex items-center">Date<SortIcon column="created_at" sort={pdfSort} /></div>
                </th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPdfLeads.map(lead => (
                <tr key={lead.id} className="border-b hover:bg-muted/50">
                  <td className="p-2"><Checkbox checked={selectedPdfLeads.has(lead.id)} onCheckedChange={() => togglePdfSelection(lead.id)} /></td>
                  <td className="p-2 font-medium">{lead.first_name || '-'}</td>
                  <td className="p-2">{lead.email}</td>
                  <td className="p-2"><Badge variant="outline">{lead.source || 'Unknown'}</Badge></td>
                  <td className="p-2 text-muted-foreground">{format(new Date(lead.created_at), 'MMM d, yyyy')}</td>
                  <td className="p-2 text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete PDF Lead</AlertDialogTitle>
                          <AlertDialogDescription>Are you sure you want to delete this PDF lead?</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteRecord("pdf_leads", lead.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </td>
                </tr>
              ))}
              {paginatedPdfLeads.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No PDF leads found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPdfPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-muted-foreground">Page {pdfPage} of {totalPdfPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={pdfPage === 1} onClick={() => setPdfPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="outline" size="sm" disabled={pdfPage === totalPdfPages} onClick={() => setPdfPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderActiveSection = () => {
    switch (activeSection) {
      case "home":
        return (
          <OrangeDoorDashboard 
            onNavigate={(section) => setActiveSection(section as AdminSection)}
            onAddClient={() => setActiveSection("clients")}
            adminPassword={storedPassword}
          />
        );
      case "automation-center":
        return <AutomationControlCenter adminPassword={storedPassword} />;
      case "sop-command-center":
        return <SOPCommandCenter adminPassword={storedPassword} />;
      case "daily-digest":
        return <DailyDigestGenerator adminPassword={storedPassword} />;
      case "team-performance":
        return <TeamPerformanceMetrics adminPassword={storedPassword} />;
      case "workload-balancer":
        return <WorkloadBalancer adminPassword={storedPassword} />;
      case "client-workflow":
        return <ClientWorkflowPanel 
          adminPassword={storedPassword} 
          onNavigateToSection={(section, context) => {
            setActiveSection(section);
            // Could store context for pre-selecting client in target section
            if (context?.clientId) {
              console.log("Navigating to section with client context:", context);
            }
          }}
        />;
      case "smart-task-queue":
        return <SmartTaskQueue adminPassword={storedPassword} />;
      case "task-notifications":
        return <TaskNotificationsPanel />;
      case "pipeline":
        return <PipelineDashboard adminPassword={storedPassword} />;
      case "alerts":
        return <AutomationAlertsPanel />;
      case "review-workflow":
        return <ReviewWorkflowPanel adminPassword={storedPassword} />;
      case "quick-actions":
        return <QuickActionsPanel />;
      case "calendar":
        return <ContentCalendarPanel />;
      case "analytics":
        return (
          <AdminAnalyticsSection
            contacts={contacts}
            gapAnalyses={gapAnalyses}
            reportPeriod={reportPeriod}
            setReportPeriod={setReportPeriod}
          />
        );
      case "activity-feed":
        return <ActivityFeedAdminPanel />;
      case "feature-guide":
        return <FeatureGuidePanel onNavigate={(section) => setActiveSection(section as AdminSection)} />;
      case "contacts":
        return renderContactsTable();
      case "gap-analysis":
        return renderGapAnalysisTable();
      case "pdf-leads":
        return renderPdfLeadsTable();
      case "emails":
        return <EmailAdminPanel password={storedPassword} />;
      case "templates":
        return <EmailTemplatesPanel />;
      case "sequences":
        return <EmailSequencesPanel />;
      case "campaigns":
        return <CampaignSenderPanel />;
      case "clients":
        return (
          <div className="space-y-6">
            <ClientPhaseTracker adminPassword={storedPassword} />
            <ClientOnboardingChecklist adminPassword={storedPassword} />
            <ClientManagementPanel adminPassword={storedPassword} />
          </div>
        );
      case "client-projects":
        return <ClientProjectsAdminPanel clientId={selectedClient?.id} adminPassword={storedPassword} />;
      case "client-analytics":
        return <ClientAnalyticsAdminPanel clientId={selectedClient?.id} />;
      case "client-invoices":
        return <ClientInvoicesAdminPanel clientId={selectedClient?.id} />;
      case "client-documents":
        return <ClientDocumentsPanel clientId={selectedClient?.id} />;
      case "client-messages":
        return <ClientMessagesAdminPanel clientId={selectedClient?.id} />;
      case "client-meetings":
        return <ClientMeetingsAdminPanel onNavigate={setActiveSection} clientId={selectedClient?.id} />;
      case "client-requests":
        return <ClientRequestsAdminPanel clientId={selectedClient?.id} />;
      case "brand-assets":
        return <BrandAssetsAdminPanel clientId={selectedClient?.id} />;
      case "team-directory":
        return <TeamDirectoryPanel adminPassword={storedPassword} />;
      case "deliverables":
        return <DeliverablesAdminPanel adminPassword={storedPassword} clientId={selectedClient?.id} />;
      case "service-agreements":
        return <ServiceAgreementsPanel />;
      case "sops":
        return <SOPManagementPanel />;
      case "automation":
        return <AutomationJobsPanel />;
      case "task-templates":
        return <TaskTemplatesPanel />;
      case "client-tasks":
        return <ClientTasksPanel adminPassword={storedPassword} clientId={selectedClient?.id} />;
      case "seo-dashboard":
        return <SeoAnalysisDashboard />;
      case "onboarding":
        return <OnboardingAutomationPanel />;
      case "integrations":
        return <IntegrationConfigPanel />;
      case "approvals":
      case "content-review":
        return <ContentReviewPanel clientId={selectedClient?.id} />;
      case "reports-review":
        return <ReportsReviewPanel />;
      case "marketing-os":
        return <MarketingOSDashboard />;
      case "review-engine":
        return <GoogleReviewEngine />;
      case "win-notifications":
        return <ClientWinNotifications />;
      case "lead-scoring":
        return <LeadScoringPanel />;
      case "ad-generator":
        return <AIAdGenerator />;
      case "case-studies":
        return <CaseStudyBuilderPanel />;
      case "client-health":
        return <ClientHealthDashboard />;
      case "website-personalization":
        return <WebsitePersonalizationPanel />;
      case "quality-assurance":
        return <QualityAssurancePanel />;
      case "before-after":
        return <BeforeAfterShowcasePanel />;
      case "sales-proposals":
        return <SalesProposalPanel />;
      case "social-posts":
        return <SocialMediaPostsPanel />;
      case "settings":
        return <AdminSettingsPanel adminPassword={storedPassword} />;
      default:
        return <PipelineDashboard adminPassword={storedPassword} />;
    }
  };

  const getSectionTitle = () => {
    const titles: Record<AdminSection, string> = {
      home: "Dashboard",
      clients: "Client Management",
      "smart-task-queue": "Smart Task Queue",
      "client-workflow": "Workflows",
      "client-tasks": "Client Tasks",
      "client-projects": "Client Projects",
      deliverables: "Deliverables",
      approvals: "Approvals",
      "client-messages": "Client Messages",
      "client-meetings": "Client Meetings",
      "client-documents": "Client Documents",
      "client-invoices": "Client Invoices",
      contacts: "Contact Submissions",
      "gap-analysis": "Gap Analysis",
      emails: "Email Centre",
      "social-posts": "Social Media Posts",
      "sales-proposals": "AI Sales Proposals",
      "seo-dashboard": "SEO",
      automation: "Automation",
      sops: "SOPs",
      onboarding: "Client Onboarding",
      "review-engine": "Review Engine",
      integrations: "Integrations",
      "team-directory": "Team",
      "task-templates": "Task Templates",
      "brand-assets": "Brand Assets",
      "service-agreements": "Service Agreements",
      settings: "Admin Settings",
      // Legacy titles for backward compatibility
      pipeline: "Pipeline Dashboard",
      "client-health": "Client Health",
      "team-performance": "Team Performance",
      "automation-center": "Automation Control Center",
      "sop-command-center": "SOP Command Center",
      "content-review": "Content Review",
      "review-workflow": "Review Workflow",
      "reports-review": "Reports Review",
      "task-notifications": "Task Notifications",
      "daily-digest": "Daily Digest",
      alerts: "Automation Alerts",
      "activity-feed": "Activity Feed",
      "feature-guide": "Feature Guide",
      "quick-actions": "Quick Actions",
      "win-notifications": "Win Notifications",
      "before-after": "Before & After Showcase",
      "case-studies": "Case Study Builder",
      "website-personalization": "Website Personalization",
      "marketing-os": "Marketing OS",
      "quality-assurance": "AI Quality Assurance",
      "lead-scoring": "AI Lead Scoring",
      "ad-generator": "AI Ad Generator",
      "workload-balancer": "Workload Balancer",
      "client-analytics": "Client Analytics",
      "client-requests": "Client Requests",
      "pdf-leads": "PDF Leads",
      templates: "Email Templates",
      sequences: "Email Sequences",
      campaigns: "Campaigns",
      calendar: "Content Calendar",
      analytics: "Analytics",
    };
    return titles[activeSection];
  };

  // Sections that don't require a client selection
  const globalSections: AdminSection[] = [
    "home", "daily-digest", "smart-task-queue", "task-notifications",
    "pipeline", "contacts", "gap-analysis", "pdf-leads",
    "emails", "templates", "sequences", "campaigns", "alerts",
    "sops", "task-templates", "settings", "analytics", "feature-guide",
    "clients", "team-directory", "team-performance", "workload-balancer",
    "integrations", "calendar",
    "quick-actions", "activity-feed", "review-workflow", "client-workflow",
    "lead-scoring", "ad-generator", "sales-proposals", "automation",
    "automation-center", "sop-command-center", "client-health",
    "onboarding", "social-posts", "seo-dashboard", "marketing-os",
    "review-engine", "win-notifications", "case-studies", "before-after",
    "quality-assurance", "website-personalization",
    // Agent office sections — show all clients' work, no client selection required
    "deliverables", "approvals", "content-review", "reports-review",
  ];

  const isGlobalSection = globalSections.includes(activeSection);
  const needsClientSelection = !isGlobalSection && !selectedClient;

  const handleSelectClient = (client: SelectedClient) => {
    setSelectedClient(client);
  };

  const handleClearClient = () => {
    setSelectedClient(null);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebar activeSection={activeSection} onSectionChange={setActiveSection} />
        
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-lg font-semibold">{getSectionTitle()}</h1>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={restartOnboarding}
              className="gap-2"
            >
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Tutorial</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchData(storedPassword)} disabled={isLoading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
              Refresh
            </Button>
          </header>
          
          {/* Client Header - shown when a client is selected (on home or client-specific sections) */}
          {selectedClient && (activeSection === "home" || !isGlobalSection) && (
            <SelectedClientHeader 
              client={selectedClient} 
              onChangeClient={handleClearClient} 
            />
          )}
          
          <main className="flex-1 p-6">
            {/* Home becomes the dashboard overview or client work */}
            {activeSection === "home" ? (
              !selectedClient ? (
                <AdminHomeDashboard
                  adminPassword={storedPassword}
                  onSelectClient={(clientId, businessName) => {
                    // Find the full client object
                    supabase.from("client_accounts").select("*").eq("id", clientId).single().then(({ data }) => {
                      if (data) {
                        setSelectedClient({
                          id: data.id,
                          business_name: data.business_name,
                          email: data.email,
                          first_name: data.first_name,
                          last_name: data.last_name,
                          tier: data.tier,
                          status: data.status,
                          industry: data.industry,
                        });
                      }
                    });
                  }}
                  onNavigateToSection={setActiveSection as (section: string) => void}
                />
              ) : (
                <UnifiedClientView client={selectedClient} adminPassword={storedPassword} onNavigateToSection={setActiveSection as (section: string) => void} />
              )
            ) : needsClientSelection ? (
              <AdminClientSelector
                adminPassword={storedPassword}
                onSelectClient={handleSelectClient}
                onAddClient={() => {
                  setActiveSection("clients");
                }}
              />
            ) : (
              <>
                {activeSection === "pipeline" && (
                  <QuickStartChecklist
                    onNavigate={setActiveSection as (section: string) => void}
                    password={storedPassword}
                  />
                )}

                {(["contacts", "gap-analysis", "pdf-leads", "analytics"] as AdminSection[]).includes(activeSection) && (
                  <AdminStatsCards
                    contactsCount={contacts.length}
                    gapAnalysesCount={gapAnalyses.length}
                    pdfLeadsCount={pdfLeads.length}
                  />
                )}

                {renderActiveSection()}
              </>
            )}
          </main>
        </SidebarInset>
        
        <AICopilotPanel 
          onNavigateToSection={(section) => setActiveSection(section)} 
          selectedClientId={selectedClient?.id}
        />
      </div>

      {showOnboarding && (
        <AdminOnboarding 
          onComplete={handleOnboardingComplete}
          onNavigate={handleOnboardingNavigate}
        />
      )}

      <GapAnalysisDetailModal
        open={isDetailModalOpen}
        onOpenChange={setIsDetailModalOpen}
        data={selectedGapAnalysis}
      />
    </SidebarProvider>
  );
};

export default Admin;
