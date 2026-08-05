import {
  Activity,
  Bell,
  LayoutDashboard,
  Bot,
  FileCheck,
  BarChart3,
  MessageCircle,
  Package,
  LogOut,
  Sparkles,
  ChevronRight,
  Settings,
  Calendar,
  FileText,
  CreditCard,
  HelpCircle,
  Palette,
  GraduationCap,
  Share2,
  Search,
  Radar,
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
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type PortalTab =
  | "activity"
  | "notifications"
  | "projects"
  | "messages"
  | "meetings"
  | "approvals"
  | "deliverables"
  | "documents"
  | "brand"
  | "social"
  | "prospects"
  | "analytics"
  | "seo"
  | "invoices"
  | "help"
  | "settings"
  | "learning"
  | "calendar";

export type ClientTier = "foundation" | "growth" | "transformation";

export interface BadgeCounts {
  notifications: number;
  messages: number;
  approvals: number;
}

interface ClientPortalSidebarProps {
  activeTab: PortalTab;
  onTabChange: (tab: PortalTab) => void;
  clientName?: string;
  businessName?: string;
  onSignOut: () => void;
  badgeCounts?: BadgeCounts;
  hiddenTabs?: string[];
  clientTier?: ClientTier;
  isOnboardingComplete?: boolean;
}

interface NavItemDef {
  id: PortalTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: keyof BadgeCounts;
}

// ── Grouped nav sections ──────────────────────────────────────────────
// All items are always visible & clickable. Tier gating happens inside tab content.

const myPortalItems: NavItemDef[] = [
  { id: "activity", label: "Home", icon: Activity },
  { id: "projects", label: "Your Agents", icon: Bot },
  { id: "messages", label: "Messages", icon: MessageCircle, badgeKey: "messages" },
  { id: "approvals", label: "Approvals", icon: FileCheck, badgeKey: "approvals" },
  { id: "deliverables", label: "Deliverables", icon: Package },
  { id: "calendar", label: "Content Calendar", icon: Calendar },
];

const brandToolsItems: NavItemDef[] = [
  { id: "brand", label: "Brand Assets", icon: Palette },
  { id: "social", label: "Social Media", icon: Share2 },
  { id: "prospects", label: "Lead Outreach", icon: Radar },
  { id: "seo", label: "SEO Health", icon: Search },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

const supportItems: NavItemDef[] = [
  { id: "notifications", label: "Updates", icon: Bell, badgeKey: "notifications" },
  { id: "meetings", label: "Meetings", icon: Calendar },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "invoices", label: "Invoices", icon: CreditCard },
  { id: "learning", label: "Learning Hub", icon: GraduationCap },
  { id: "help", label: "Help", icon: HelpCircle },
  { id: "settings", label: "Settings", icon: Settings },
];

// ── NavItem ───────────────────────────────────────────────────────────

interface NavItemProps {
  item: NavItemDef;
  activeTab: PortalTab;
  onTabChange: (tab: PortalTab) => void;
  badgeCounts?: BadgeCounts;
}

function NavItem({ item, activeTab, onTabChange, badgeCounts }: NavItemProps) {
  const isActive = activeTab === item.id;
  const badgeCount = item.badgeKey && badgeCounts ? badgeCounts[item.badgeKey] : 0;
  const showBadge = badgeCount > 0 && !isActive;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        onClick={() => onTabChange(item.id)}
        tooltip={item.label}
        className={cn(
          "relative transition-all duration-200 rounded-xl h-10",
          isActive
            ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
            : "hover:bg-muted/80"
        )}
      >
        <item.icon className={cn("h-4 w-4", isActive && "scale-110")} />
        <span className="flex-1 font-medium">{item.label}</span>
        {showBadge && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center bg-primary text-primary-foreground">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
        {isActive && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────

export function ClientPortalSidebar({
  activeTab,
  onTabChange,
  clientName,
  businessName,
  onSignOut,
  badgeCounts,
  hiddenTabs = [],
  // Keep props for call-site compat — no longer used for sidebar filtering
  clientTier: _clientTier = "foundation",
  isOnboardingComplete: _isOnboardingComplete = true,
}: ClientPortalSidebarProps) {
  const filterItems = (items: NavItemDef[]) =>
    items.filter(item => !hiddenTabs.includes(item.id));

  const initials = clientName
    ?.split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "CL";

  const renderItems = (items: NavItemDef[]) =>
    filterItems(items).map((item) => (
      <NavItem
        key={item.id}
        item={item}
        activeTab={activeTab}
        onTabChange={onTabChange}
        badgeCounts={badgeCounts}
      />
    ));

  const labelClass = "text-[10px] uppercase tracking-widest text-muted-foreground/60 px-2 mb-1";

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4 pb-6 group-data-[collapsible=icon]:p-2">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-bold text-sm truncate max-w-[140px]">
              {businessName || "Client Portal"}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 group-data-[collapsible=icon]:px-2">
        <SidebarGroup>
          <SidebarGroupLabel className={labelClass}>My Portal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">{renderItems(myPortalItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className={labelClass}>Brand & Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">{renderItems(brandToolsItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="mx-3 my-4 border-t border-border/40" />

        <SidebarGroup>
          <SidebarGroupLabel className={labelClass}>Support</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">{renderItems(supportItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 mt-auto">
        <div className="rounded-xl bg-muted/50 p-3 group-data-[collapsible=icon]:p-2">
          <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="text-sm font-semibold truncate">{clientName || "Client"}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onSignOut}
              className="h-7 w-7 shrink-0 rounded-lg hover:bg-destructive/10 hover:text-destructive group-data-[collapsible=icon]:hidden"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
