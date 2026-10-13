import { useState, useEffect } from "react";
import {
  Users,
  Settings,
  ChevronDown,
  ChevronRight,
  FileText,
  BarChart3,
  FolderOpen,
  Mail,
  Share2,
  Contact,
  Layers,
  Palette,
  LogOut,
  HelpCircle,
  Search,
  Bell,
  RefreshCw,
  UserCog,
  Radar,
  Activity,
  LayoutDashboard,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  | "automation-center"
  | "content-review"
  | "reports-review"
  | "alerts"
  | "cycles"
  | "activity-feed"
  | "feature-guide"
  | "quick-actions"
  | "before-after"
  | "case-studies"
  | "quality-assurance"
  | "lead-scoring"
  | "client-analytics"
  | "client-requests"
  | "pdf-leads"
  | "quick-scans"
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

// Grouped by what the owner is trying to do, not by how the code is organised.

// CLIENTS: who we work for, and what we know about them.
const clientItems: NavItem[] = [
  { id: "clients", label: "Clients", icon: Users },
  { id: "client-projects", label: "Projects", icon: Layers },
  { id: "brand-assets", label: "Brand Assets", icon: Palette },
];

// AGENTS: the things the platform does for clients. Each one is a real panel
// with its own data; the Command Center shows them all side by side.
const agentItems: NavItem[] = [
  { id: "social-posts", label: "Social", icon: Share2 },
  { id: "content-review", label: "Content approvals", icon: FileText, matchIds: ["approvals", "deliverables"] },
  { id: "prospect-engine", label: "Prospecting", icon: Radar },
  { id: "emails", label: "Outreach emails", icon: Mail },
  { id: "seo-dashboard", label: "SEO", icon: Search },
  { id: "reports-review", label: "Reports", icon: BarChart3 },
];

// MONITORING: is it all running, and what happened.
const monitoringItems: NavItem[] = [
  { id: "cycles", label: "Work cycles", icon: RefreshCw },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "activity-feed", label: "Activity log", icon: Activity },
];

// GROWTH: OrangeDoor's own top-of-funnel -- people who submitted the marketing
// site's form/quick-scan or downloaded a PDF. Not to be confused with
// "Prospecting" above, which is a client's own cold-outreach candidates.
// (Sales hub -- proposals / case studies / before-after -- is hidden: unused.
// Its routes still work; re-add { id: "sales-proposals", ... } to restore.)
const growthItems: NavItem[] = [
  { id: "contacts", label: "Our leads", icon: Contact, matchIds: ["gap-analysis", "pdf-leads", "quick-scans", "pipeline", "lead-scoring"] },
];

// ADMIN
const adminItems: NavItem[] = [
  { id: "team-directory", label: "Team", icon: UserCog },
  { id: "settings", label: "Settings", icon: Settings },
];

interface NavGroupProps {
  label: string;
  items: NavItem[];
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  defaultOpen?: boolean;
  collapsible?: boolean;
  badges?: Partial<Record<AdminSection, number>>;
}

function isItemActive(item: NavItem, activeSection: AdminSection): boolean {
  return activeSection === item.id || !!item.matchIds?.includes(activeSection);
}

function NavGroup({ label, items, activeSection, onSectionChange, defaultOpen = false, collapsible = true, badges }: NavGroupProps) {
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
              <span className="flex-1">{item.label}</span>
              {!!badges?.[item.id] && (
                <span className="ml-auto rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium leading-none text-destructive-foreground group-data-[collapsible=icon]:hidden">
                  {badges[item.id]! > 99 ? "99+" : badges[item.id]}
                </span>
              )}
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

/** Alerts that still need a person: unacknowledged, warning or worse, from the last 7 days.
 * (Counting every unacknowledged alert ever raised pinned this badge at "99+" forever.) */
function useUnacknowledgedAlertCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { count: c } = await supabase
        .from("automation_alerts")
        .select("id", { count: "exact", head: true })
        .is("acknowledged_at", null)
        .in("severity", ["warning", "error", "critical"])
        .gte("created_at", since);
      if (!cancelled) setCount(c ?? 0);
    };

    refresh();

    const channel = supabase
      .channel("admin-sidebar-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "automation_alerts" }, refresh)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return count;
}

export function AdminSidebar({ activeSection, onSectionChange, onLogout }: AdminSidebarProps) {
  const alertCount = useUnacknowledgedAlertCount();
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
                  tooltip="Command Center"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Command Center</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <NavGroup label="Clients" items={clientItems} activeSection={activeSection} onSectionChange={onSectionChange} defaultOpen collapsible={false} />
        <NavGroup label="Agents" items={agentItems} activeSection={activeSection} onSectionChange={onSectionChange} defaultOpen collapsible={false} />
        <NavGroup label="Monitoring" items={monitoringItems} activeSection={activeSection} onSectionChange={onSectionChange} defaultOpen collapsible={false} badges={{ alerts: alertCount }} />
        <NavGroup label="Growth" items={growthItems} activeSection={activeSection} onSectionChange={onSectionChange} defaultOpen collapsible={false} />
        <NavGroup label="Admin" items={adminItems} activeSection={activeSection} onSectionChange={onSectionChange} defaultOpen collapsible={false} />
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
