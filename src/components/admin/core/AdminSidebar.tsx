import { useState, useEffect } from "react";
import {
  Users,
  Settings,
  Briefcase,
  ChevronDown,
  ChevronRight,
  FileText,
  BarChart3,
  FolderOpen,
  FileCheck,
  Mail,
  Share2,
  Search,
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
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type AdminSection = 
  | "home"
  | "clients"
  | "smart-task-queue"
  | "client-workflow"
  | "client-tasks"
  | "client-projects"
  | "deliverables"
  | "approvals"
  | "client-messages"
  | "client-meetings"
  | "client-documents"
  | "client-invoices"
  | "contacts"
  | "gap-analysis"
  | "emails"
  | "social-posts"
  | "sales-proposals"
  | "seo-dashboard"
  | "automation"
  | "sops"
  | "onboarding"
  | "review-engine"
  | "integrations"
  | "team-directory"
  | "task-templates"
  | "brand-assets"
  | "service-agreements"
  | "settings"
  // Legacy sections kept for routing compatibility
  | "pipeline"
  | "client-health"
  | "team-performance"
  | "automation-center"
  | "sop-command-center"
  | "content-review"
  | "review-workflow"
  | "reports-review"
  | "task-notifications"
  | "daily-digest"
  | "alerts"
  | "activity-feed"
  | "feature-guide"
  | "quick-actions"
  | "win-notifications"
  | "before-after"
  | "case-studies"
  | "website-personalization"
  | "marketing-os"
  | "quality-assurance"
  | "lead-scoring"
  | "ad-generator"
  | "workload-balancer"
  | "client-analytics"
  | "client-requests"
  | "pdf-leads"
  | "templates"
  | "sequences"
  | "campaigns"
  | "calendar"
  | "analytics";

interface AdminSidebarProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
}

interface NavItem {
  id: AdminSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

// AGENTS group
const agentItems: NavItem[] = [
  { id: "seo-dashboard", label: "SEO", icon: Search },
  { id: "deliverables", label: "Content", icon: FileText },
  { id: "social-posts", label: "Social", icon: Share2 },
  { id: "emails", label: "Email", icon: Mail },
  { id: "reports-review", label: "Reports", icon: BarChart3 },
];

// OPERATIONS group
const operationsItems: NavItem[] = [
  { id: "clients", label: "Clients", icon: Users },
  { id: "client-workflow", label: "Workflows", icon: Briefcase },
  { id: "approvals", label: "Approvals", icon: FileCheck },
  { id: "settings", label: "Settings", icon: Settings },
];

interface NavGroupProps {
  label: string;
  items: NavItem[];
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  defaultOpen?: boolean;
  collapsible?: boolean;
}

function NavGroup({ label, items, activeSection, onSectionChange, defaultOpen = false, collapsible = true }: NavGroupProps) {
  const hasActiveItem = items.some(item => item.id === activeSection);
  const [open, setOpen] = useState(defaultOpen || hasActiveItem);

  useEffect(() => {
    if (hasActiveItem) setOpen(true);
  }, [hasActiveItem]);

  const menuContent = (
    <SidebarGroupContent>
      <SidebarMenu>
        {items.map((item) => (
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
  );

  if (!collapsible) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        {menuContent}
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="cursor-pointer hover:bg-sidebar-accent rounded-md px-2 py-1.5 flex items-center justify-between group-data-[collapsible=icon]:justify-center">
            <span className="group-data-[collapsible=icon]:hidden">{label}</span>
            <FolderOpen className="h-4 w-4 hidden group-data-[collapsible=icon]:block" />
            {open ? (
              <ChevronDown className="h-4 w-4 group-data-[collapsible=icon]:hidden" />
            ) : (
              <ChevronRight className="h-4 w-4 group-data-[collapsible=icon]:hidden" />
            )}
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>{menuContent}</CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
}

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
        <NavGroup label="Agents" items={agentItems} activeSection={activeSection} onSectionChange={onSectionChange} defaultOpen collapsible={false} />
        <NavGroup label="Operations" items={operationsItems} activeSection={activeSection} onSectionChange={onSectionChange} defaultOpen collapsible={false} />
      </SidebarContent>
    </Sidebar>
  );
}
