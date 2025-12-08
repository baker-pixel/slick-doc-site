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
  FileSignature
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
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export type AdminSection = 
  | "pipeline" 
  | "alerts" 
  | "quick-actions" 
  | "calendar"
  | "analytics" 
  | "contacts"
  | "gap-analysis"
  | "pdf-leads"
  | "emails"
  | "clients"
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
  | "content-review"
  | "reports-review";

interface AdminSidebarProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
}

const mainNavItems = [
  { id: "pipeline" as const, label: "Pipeline", icon: Activity },
  { id: "alerts" as const, label: "Alerts", icon: Bell },
  { id: "quick-actions" as const, label: "Quick Actions", icon: Zap },
  { id: "calendar" as const, label: "Calendar", icon: CalendarIcon },
  { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
];

const leadsNavItems = [
  { id: "contacts" as const, label: "Contacts", icon: Users },
  { id: "gap-analysis" as const, label: "Gap Analysis", icon: FileText },
  { id: "pdf-leads" as const, label: "PDF Leads", icon: Mail },
];

const emailNavItems = [
  { id: "emails" as const, label: "Email Admin", icon: Send },
  { id: "templates" as const, label: "Templates", icon: FileText },
  { id: "sequences" as const, label: "Sequences", icon: Mail },
  { id: "campaigns" as const, label: "Campaigns", icon: Send },
];

const advancedNavItems = [
  { id: "clients" as const, label: "Clients", icon: Briefcase },
  { id: "client-messages" as const, label: "Messages", icon: MessageCircle },
  { id: "client-meetings" as const, label: "Meetings", icon: CalendarCheck },
  { id: "client-requests" as const, label: "Requests", icon: ClipboardList },
  { id: "brand-assets" as const, label: "Brand Assets", icon: Palette },
  { id: "team-directory" as const, label: "Team Directory", icon: UserCircle },
  { id: "deliverables" as const, label: "Deliverables", icon: FileCheck },
  { id: "service-agreements" as const, label: "Agreements", icon: FileSignature },
  { id: "client-documents" as const, label: "Documents", icon: FolderOpen },
  { id: "sops" as const, label: "SOPs", icon: FileCheck },
  { id: "automation" as const, label: "Automation Jobs", icon: Bot },
  { id: "content-review" as const, label: "Content Review", icon: ClipboardCheck },
  { id: "reports-review" as const, label: "Reports Review", icon: FileCheck },
];

export function AdminSidebar({ activeSection, onSectionChange }: AdminSidebarProps) {
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
          <SidebarGroupLabel>Advanced</SidebarGroupLabel>
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
