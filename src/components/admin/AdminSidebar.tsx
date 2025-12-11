import { useState, useEffect } from "react";
import { 
  Activity, 
  Bell, 
  Zap, 
  CalendarIcon, 
  BarChart3, 
  Users, 
  Send, 
  Settings,
  FileText,
  Mail,
  Briefcase,
  Bot,
  ClipboardCheck,
  FileCheck,
  FolderOpen,
  MessageCircle,
  CalendarCheck,
  ClipboardList,
  Palette,
  UserCircle,
  FileSignature,
  Receipt,
  Target,
  Star,
  Megaphone
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
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export type AdminSection = 
  | "pipeline" 
  | "alerts" 
  | "quick-actions" 
  | "calendar"
  | "analytics"
  | "activity-feed"
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
  | "settings";

interface AdminSidebarProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
}

import { List } from "lucide-react";

const mainNavItems = [
  { id: "pipeline" as const, label: "Pipeline", icon: Activity },
  { id: "alerts" as const, label: "Alerts", icon: Bell },
  { id: "quick-actions" as const, label: "Quick Actions", icon: Zap },
  { id: "calendar" as const, label: "Calendar", icon: CalendarIcon },
  { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
  { id: "activity-feed" as const, label: "Activity Feed", icon: List },
];

import { Brain } from "lucide-react";

const leadsNavItems = [
  { id: "contacts" as const, label: "Contacts", icon: Users },
  { id: "gap-analysis" as const, label: "Gap Analysis", icon: FileText },
  { id: "pdf-leads" as const, label: "PDF Leads", icon: Mail },
  { id: "lead-scoring" as const, label: "Lead Scoring", icon: Brain },
];

const emailNavItems = [
  { id: "emails" as const, label: "Email Admin", icon: Send },
  { id: "templates" as const, label: "Templates", icon: FileText },
  { id: "sequences" as const, label: "Sequences", icon: Mail },
  { id: "campaigns" as const, label: "Campaigns", icon: Send },
];

import { Rocket, Link2, ListChecks, Trophy, BookOpen, HeartPulse } from "lucide-react";

const automationNavItems = [
  { id: "onboarding" as const, label: "Client Onboarding", icon: Rocket },
  { id: "task-templates" as const, label: "Task Templates", icon: ListChecks },
  { id: "client-tasks" as const, label: "Client Tasks", icon: ClipboardList },
  { id: "automation" as const, label: "Automation Jobs", icon: Bot },
  { id: "integrations" as const, label: "Integrations", icon: Link2 },
  { id: "seo-dashboard" as const, label: "SEO Dashboard", icon: BarChart3 },
  { id: "marketing-os" as const, label: "Marketing OS", icon: Target },
  { id: "review-engine" as const, label: "Review Engine", icon: Star },
  { id: "win-notifications" as const, label: "Win Notifications", icon: Trophy },
  { id: "ad-generator" as const, label: "AI Ad Generator", icon: Megaphone },
  { id: "case-studies" as const, label: "Case Studies", icon: BookOpen },
  { id: "client-health" as const, label: "Client Health", icon: HeartPulse },
];

const advancedNavItems = [
  { id: "clients" as const, label: "Clients", icon: Briefcase },
  { id: "client-projects" as const, label: "Projects", icon: Target },
  { id: "client-analytics" as const, label: "Client Analytics", icon: BarChart3 },
  { id: "client-invoices" as const, label: "Invoices", icon: Receipt },
  { id: "client-messages" as const, label: "Messages", icon: MessageCircle },
  { id: "client-meetings" as const, label: "Meetings", icon: CalendarCheck },
  { id: "client-requests" as const, label: "Requests", icon: ClipboardList },
  { id: "brand-assets" as const, label: "Brand Assets", icon: Palette },
  { id: "team-directory" as const, label: "Team Directory", icon: UserCircle },
  { id: "deliverables" as const, label: "Deliverables", icon: FileCheck },
  { id: "service-agreements" as const, label: "Agreements", icon: FileSignature },
  { id: "client-documents" as const, label: "Documents", icon: FolderOpen },
  { id: "sops" as const, label: "SOPs", icon: FileCheck },
  { id: "content-review" as const, label: "Content Review", icon: ClipboardCheck },
  { id: "reports-review" as const, label: "Reports Review", icon: FileCheck },
  { id: "settings" as const, label: "Settings", icon: Settings },
];

export function AdminSidebar({ activeSection, onSectionChange }: AdminSidebarProps) {
  const [unacknowledgedCount, setUnacknowledgedCount] = useState(0);

  useEffect(() => {
    // Fetch initial count
    const fetchAlertCount = async () => {
      const { count } = await supabase
        .from("automation_alerts")
        .select("*", { count: "exact", head: true })
        .is("acknowledged_at", null);
      setUnacknowledgedCount(count || 0);
    };

    fetchAlertCount();

    // Subscribe to changes
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
        <SidebarGroup>
          <SidebarGroupLabel>Overview</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
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

        <SidebarGroup>
          <SidebarGroupLabel>Leads</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {leadsNavItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={activeSection === item.id}
                    onClick={() => onSectionChange(item.id)}
                    tooltip={item.label}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Email</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {emailNavItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={activeSection === item.id}
                    onClick={() => onSectionChange(item.id)}
                    tooltip={item.label}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Automation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {automationNavItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={activeSection === item.id}
                    onClick={() => onSectionChange(item.id)}
                    tooltip={item.label}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Client Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {advancedNavItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={activeSection === item.id}
                    onClick={() => onSectionChange(item.id)}
                    tooltip={item.label}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
