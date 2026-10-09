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
          "relative h-10 rounded-xl transition-colors duration-200 group-data-[collapsible=icon]:!h-10 group-data-[collapsible=icon]:!w-10 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center",
          isActive
            ? "!bg-primary/15 !text-primary font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-primary group-data-[collapsible=icon]:before:hidden group-data-[collapsible=icon]:ring-1 group-data-[collapsible=icon]:ring-primary/40"
            : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        )}
      >
        <item.icon className="h-[18px] w-[18px] shrink-0" />
        <span className="flex-1 font-medium">{item.label}</span>
        {showBadge && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center bg-primary text-primary-foreground group-data-[collapsible=icon]:hidden">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
        {showBadge && (
          <span
            aria-label={`${badgeCount} new`}
            className="absolute right-1.5 top-1.5 hidden h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background group-data-[collapsible=icon]:block"
          />
        )}
        {isActive && <ChevronRight className="h-3.5 w-3.5 opacity-60 group-data-[collapsible=icon]:hidden" />}
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

  const labelClass = "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-3 mb-1";
  // In the icon rail the text labels are hidden, so groups are split by a thin divider instead.
  const railGroupClass = "group-data-[collapsible=icon]:mt-1 group-data-[collapsible=icon]:border-t group-data-[collapsible=icon]:border-border/40 group-data-[collapsible=icon]:pt-2";

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

      <SidebarContent className="px-3 group-data-[collapsible=icon]:px-1.5 group-data-[collapsible=icon]:!overflow-y-auto group-data-[collapsible=icon]:[scrollbar-width:none] group-data-[collapsible=icon]:[&::-webkit-scrollbar]:hidden">
        <SidebarGroup>
          <SidebarGroupLabel className={labelClass}>My Portal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">{renderItems(myPortalItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className={railGroupClass}>
          <SidebarGroupLabel className={labelClass}>Brand & Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">{renderItems(brandToolsItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="mx-3 my-2 border-t border-border/40 group-data-[collapsible=icon]:hidden" />

        <SidebarGroup className={railGroupClass}>
          <SidebarGroupLabel className={labelClass}>Support</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">{renderItems(supportItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="mt-auto p-3 group-data-[collapsible=icon]:p-2">
        <div className="rounded-xl bg-muted/50 p-3 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
          <div className="flex items-center gap-3 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
            <Avatar className="h-8 w-8 shrink-0" title={clientName || "Client"}>
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold">{clientName || "Client"}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onSignOut}
              className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
