import { useState, useEffect } from "react";
import { 
  Activity, 
  Bell, 
  Users, 
  Settings,
  Briefcase,
  ChevronDown,
  ChevronRight,
  PlayCircle,
  FolderOpen,
  Home,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export type AdminSection = 
  | "home"
  | "client-workflow"
  | "pipeline" 
  | "alerts" 
  | "quick-actions" 
  | "calendar"
  | "analytics"
  | "activity-feed"
  | "feature-guide"
  | "review-workflow"
  | "contacts"
  | "gap-analysis"
  | "pdf-leads"
  | "emails"
  | "clients"
  | "client-projects"
  | "client-analytics"
  | "client-invoices"
  | "client-documents"
  | "client-messages"
  | "client-meetings"
  | "client-requests"
  | "brand-assets"
  | "team-directory"
  | "deliverables"
  | "service-agreements"
  | "templates"
  | "sequences"
  | "campaigns"
  | "sops"
  | "automation"
  | "task-templates"
  | "client-tasks"
  | "onboarding"
  | "integrations"
  | "content-review"
  | "marketing-os"
  | "review-engine"
  | "reports-review"
  | "seo-dashboard"
  | "win-notifications"
  | "lead-scoring"
  | "ad-generator"
  | "case-studies"
  | "client-health"
  | "website-personalization"
  | "quality-assurance"
  | "before-after"
  | "sales-proposals"
  | "settings";

interface AdminSidebarProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
}

// Daily Work - The essentials
const dailyWorkItems = [
  { id: "home" as const, label: "Home", icon: Home },
  { id: "client-workflow" as const, label: "Client Workflow", icon: PlayCircle },
  { id: "clients" as const, label: "Clients", icon: Briefcase },
  { id: "pipeline" as const, label: "Pipeline", icon: Activity },
  { id: "contacts" as const, label: "Leads", icon: Users },
  { id: "alerts" as const, label: "Alerts", icon: Bell },
];

// Client Work - Tasks, deliverables, communications
const clientWorkItems = [
  { id: "client-tasks" as const, label: "Tasks" },
  { id: "deliverables" as const, label: "Deliverables" },
  { id: "client-projects" as const, label: "Projects" },
  { id: "client-messages" as const, label: "Messages" },
  { id: "client-meetings" as const, label: "Meetings" },
  { id: "client-requests" as const, label: "Requests" },
];

// Marketing & Sales
const marketingItems = [
  { id: "gap-analysis" as const, label: "Gap Analysis" },
  { id: "pdf-leads" as const, label: "PDF Leads" },
  { id: "lead-scoring" as const, label: "Lead Scoring" },
  { id: "emails" as const, label: "Email Center" },
  { id: "campaigns" as const, label: "Campaigns" },
  { id: "ad-generator" as const, label: "AI Ad Generator" },
  { id: "sales-proposals" as const, label: "Proposals" },
];

// Config & Settings
const configItems = [
  { id: "team-directory" as const, label: "Team" },
  { id: "task-templates" as const, label: "Templates" },
  { id: "automation" as const, label: "Automation" },
  { id: "integrations" as const, label: "Integrations" },
  { id: "sops" as const, label: "SOPs" },
  { id: "feature-guide" as const, label: "Guide" },
  { id: "settings" as const, label: "Settings" },
];

export function AdminSidebar({ activeSection, onSectionChange }: AdminSidebarProps) {
  const [unacknowledgedCount, setUnacknowledgedCount] = useState(0);
  const [clientWorkOpen, setClientWorkOpen] = useState(false);
  const [marketingOpen, setMarketingOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  // Auto-expand if active section is in a collapsed group
  useEffect(() => {
    if (clientWorkItems.some(item => item.id === activeSection)) {
      setClientWorkOpen(true);
    }
    if (marketingItems.some(item => item.id === activeSection)) {
      setMarketingOpen(true);
    }
    if (configItems.some(item => item.id === activeSection)) {
      setConfigOpen(true);
    }
  }, [activeSection]);

  useEffect(() => {
    const fetchAlertCount = async () => {
      const { count } = await supabase
        .from("automation_alerts")
        .select("*", { count: "exact", head: true })
        .is("acknowledged_at", null);
      setUnacknowledgedCount(count || 0);
    };

    fetchAlertCount();

    const channel = supabase
      .channel("sidebar-alert-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "automation_alerts" },
        () => fetchAlertCount()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <Settings className="h-5 w-5 text-primary" />
          <span className="font-semibold group-data-[collapsible=icon]:hidden">Admin</span>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        {/* Daily Work - Always visible */}
        <SidebarGroup>
          <SidebarGroupLabel>Daily Work</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dailyWorkItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={activeSection === item.id}
                    onClick={() => onSectionChange(item.id)}
                    tooltip={item.label}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                  {item.id === "alerts" && unacknowledgedCount > 0 && (
                    <SidebarMenuBadge className="bg-red-500 text-white">
                      {unacknowledgedCount}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Client Work - Collapsible */}
        <SidebarGroup>
          <Collapsible open={clientWorkOpen} onOpenChange={setClientWorkOpen}>
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="cursor-pointer hover:bg-sidebar-accent rounded-md px-2 py-1.5 flex items-center justify-between group-data-[collapsible=icon]:justify-center">
                <span className="group-data-[collapsible=icon]:hidden">Client Work</span>
                <FolderOpen className="h-4 w-4 hidden group-data-[collapsible=icon]:block" />
                {clientWorkOpen ? (
                  <ChevronDown className="h-4 w-4 group-data-[collapsible=icon]:hidden" />
                ) : (
                  <ChevronRight className="h-4 w-4 group-data-[collapsible=icon]:hidden" />
                )}
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {clientWorkItems.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={activeSection === item.id}
                        onClick={() => onSectionChange(item.id)}
                        tooltip={item.label}
                        className="pl-4"
                      >
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Marketing & Sales - Collapsible */}
        <SidebarGroup>
          <Collapsible open={marketingOpen} onOpenChange={setMarketingOpen}>
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="cursor-pointer hover:bg-sidebar-accent rounded-md px-2 py-1.5 flex items-center justify-between group-data-[collapsible=icon]:justify-center">
                <span className="group-data-[collapsible=icon]:hidden">Marketing</span>
                <FolderOpen className="h-4 w-4 hidden group-data-[collapsible=icon]:block" />
                {marketingOpen ? (
                  <ChevronDown className="h-4 w-4 group-data-[collapsible=icon]:hidden" />
                ) : (
                  <ChevronRight className="h-4 w-4 group-data-[collapsible=icon]:hidden" />
                )}
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {marketingItems.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={activeSection === item.id}
                        onClick={() => onSectionChange(item.id)}
                        tooltip={item.label}
                        className="pl-4"
                      >
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Config & Settings - Collapsible */}
        <SidebarGroup>
          <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="cursor-pointer hover:bg-sidebar-accent rounded-md px-2 py-1.5 flex items-center justify-between group-data-[collapsible=icon]:justify-center">
                <span className="group-data-[collapsible=icon]:hidden">Settings</span>
                <Settings className="h-4 w-4 hidden group-data-[collapsible=icon]:block" />
                {configOpen ? (
                  <ChevronDown className="h-4 w-4 group-data-[collapsible=icon]:hidden" />
                ) : (
                  <ChevronRight className="h-4 w-4 group-data-[collapsible=icon]:hidden" />
                )}
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {configItems.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={activeSection === item.id}
                        onClick={() => onSectionChange(item.id)}
                        tooltip={item.label}
                        className="pl-4"
                      >
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
