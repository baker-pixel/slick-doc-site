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
  Mail,
  Share2,
  Home,
  Contact,
  Layers,
  Palette,
  LogOut,
  HelpCircle,
  Search,
  Send,
  Bot,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type AdminSection = 
  | "home"
  | "clients"
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
  | "ai-agent"
  | "settings"
  // Legacy sections kept for routing compatibility
  | "pipeline"
  | "client-health"
  | "team-performance"
  | "automation-center"
  | "sop-command-center"
  | "content-review"
  | "reports-review"
  | "task-notifications"
  | "daily-digest"
  | "alerts"
  | "activity-feed"
  | "feature-guide"
  | "quick-actions"
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
  | "analytics"
  | "prospect-engine";

interface AdminSidebarProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  onLogout: () => void;
}

interface NavItem {
  id: AdminSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Additional section ids that should show this item as active -- for
   * sections merged behind one nav entry, so the highlighted item stays
   * correct. */
  matchIds?: AdminSection[];
}

// AGENTS group
const agentItems: NavItem[] = [
  { id: "ai-agent", label: "AI Agent", icon: Bot },
  { id: "seo-dashboard", label: "SEO", icon: Search },
  { id: "content-review", label: "Content", icon: FileText, matchIds: ["approvals", "deliverables"] },
  { id: "social-posts", label: "Social", icon: Share2 },
  { id: "emails", label: "Email", icon: Mail },
  { id: "reports-review", label: "Reports", icon: BarChart3 },
];

// GROWTH group
const growthItems: NavItem[] = [
  { id: "contacts", label: "Leads", icon: Contact, matchIds: ["gap-analysis", "pdf-leads", "prospect-engine", "pipeline", "lead-scoring"] },
  { id: "sales-proposals", label: "Sales", icon: Send, matchIds: ["case-studies", "before-after"] },
];

// OPERATIONS group
const operationsItems: NavItem[] = [
  { id: "clients", label: "Clients", icon: Users },
  { id: "client-projects", label: "Projects", icon: Layers },
  { id: "client-workflow", label: "Workflows", icon: Briefcase },
  { id: "brand-assets", label: "Brand Assets", icon: Palette },
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

function isItemActive(item: NavItem, activeSection: AdminSection): boolean {
  return activeSection === item.id || !!item.matchIds?.includes(activeSection);
}

function NavGroup({ label, items, activeSection, onSectionChange, defaultOpen = false, collapsible = true }: NavGroupProps) {
  const hasActiveItem = items.some(item => isItemActive(item, activeSection));
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
              isActive={isItemActive(item, activeSection)}
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

export function AdminSidebar({ activeSection, onSectionChange, onLogout }: AdminSidebarProps) {
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
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeSection === "home"}
                  onClick={() => onSectionChange("home")}
                  tooltip="Home"
                >
                  <Home className="h-4 w-4" />
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <NavGroup label="Agents" items={agentItems} activeSection={activeSection} onSectionChange={onSectionChange} defaultOpen collapsible={false} />
        <NavGroup label="Growth" items={growthItems} activeSection={activeSection} onSectionChange={onSectionChange} defaultOpen collapsible={false} />
        <NavGroup label="Operations" items={operationsItems} activeSection={activeSection} onSectionChange={onSectionChange} defaultOpen collapsible={false} />
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeSection === "feature-guide"}
              onClick={() => onSectionChange("feature-guide")}
              tooltip="Help & Feature Guide"
            >
              <HelpCircle className="h-4 w-4" />
              <span>Help</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onLogout}
              tooltip="Logout"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
