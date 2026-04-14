import {
  Activity,
  Bell,
  LayoutDashboard,
  FileCheck,
  BarChart3,
  MessageCircle,
  Package,
  LogOut,
  Sparkles,
  ChevronRight,
  Settings,
  Lock,
  Calendar,
  FileText,
  CreditCard,
  HelpCircle,
  Palette,
  KeyRound,
  Users,
  FileSignature,
  GraduationCap,
  Send,
  Plug,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type PortalTab =
  | "activity"
  | "notifications"
  | "projects"
  | "messages"
  | "meetings"
  | "requests"
  | "approvals"
  | "deliverables"
  | "documents"
  | "agreements"
  | "brand"
  | "access"
  | "integrations"
  | "team"
  | "analytics"
  | "invoices"
  | "help"
  | "settings"
  | "learning";

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
}

interface NavItemDef {
  id: PortalTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: keyof BadgeCounts;
  minTier: ClientTier;
}

const TIER_RANK: Record<ClientTier, number> = {
  foundation: 0,
  growth: 1,
  transformation: 2,
};

const TIER_DISPLAY: Record<ClientTier, string> = {
  foundation: "Foundation",
  growth: "Growth",
  transformation: "Transformation",
};

// All navigable items with their minimum required tier
const allNavItems: NavItemDef[] = [
  { id: "activity", label: "Home", icon: Activity, minTier: "foundation" },
  { id: "projects", label: "Projects", icon: LayoutDashboard, minTier: "foundation" },
  { id: "approvals", label: "Approvals", icon: FileCheck, badgeKey: "approvals", minTier: "growth" },
  { id: "messages", label: "Messages", icon: MessageCircle, badgeKey: "messages", minTier: "foundation" },
  { id: "deliverables", label: "Deliverables", icon: Package, minTier: "foundation" },
  { id: "analytics", label: "Analytics", icon: BarChart3, minTier: "foundation" },
  { id: "brand", label: "Brand Assets", icon: Palette, minTier: "growth" },
  { id: "access", label: "Platform Access", icon: KeyRound, minTier: "growth" },
  { id: "integrations", label: "Integrations", icon: Plug, minTier: "growth" },
  { id: "learning", label: "Learning Hub", icon: GraduationCap, minTier: "growth" },
  { id: "agreements", label: "Agreements", icon: FileSignature, minTier: "transformation" },
  { id: "team", label: "Your Team", icon: Users, minTier: "transformation" },
];

const secondaryItems: NavItemDef[] = [
  { id: "notifications", label: "Updates", icon: Bell, badgeKey: "notifications", minTier: "foundation" },
  { id: "meetings", label: "Meetings", icon: Calendar, minTier: "foundation" },
  { id: "requests", label: "Requests", icon: Send, minTier: "foundation" },
  { id: "documents", label: "Documents", icon: FileText, minTier: "foundation" },
  { id: "invoices", label: "Invoices", icon: CreditCard, minTier: "foundation" },
  { id: "help", label: "Help", icon: HelpCircle, minTier: "foundation" },
  { id: "settings", label: "Settings", icon: Settings, minTier: "foundation" },
];

function hasAccess(tier: ClientTier, minTier: ClientTier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[minTier];
}

function getUpgradeTierName(minTier: ClientTier): string {
  return TIER_DISPLAY[minTier];
}

interface NavItemProps {
  item: NavItemDef;
  activeTab: PortalTab;
  onTabChange: (tab: PortalTab) => void;
  badgeCounts?: BadgeCounts;
  locked: boolean;
  lockTierName?: string;
}

function NavItem({ item, activeTab, onTabChange, badgeCounts, locked, lockTierName }: NavItemProps) {
  const isActive = activeTab === item.id;
  const badgeCount = item.badgeKey && badgeCounts ? badgeCounts[item.badgeKey] : 0;
  const showBadge = badgeCount > 0 && !isActive && !locked;

  const button = (
    <SidebarMenuButton
      isActive={!locked && isActive}
      onClick={locked ? undefined : () => onTabChange(item.id)}
      tooltip={locked ? `Available in ${lockTierName} plan` : item.label}
      className={cn(
        "relative transition-all duration-200 rounded-xl h-10",
        locked
          ? "opacity-50 cursor-not-allowed"
          : isActive
            ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
            : "hover:bg-muted/80"
      )}
    >
      <item.icon className={cn("h-4 w-4", !locked && isActive && "scale-110")} />
      <span className="flex-1 font-medium">{item.label}</span>
      {locked && <Lock className="h-3 w-3 opacity-60" />}
      {showBadge && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center bg-primary text-primary-foreground">
          {badgeCount > 9 ? "9+" : badgeCount}
        </span>
      )}
      {!locked && isActive && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
    </SidebarMenuButton>
  );

  if (locked) {
    return (
      <SidebarMenuItem>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="right" className="max-w-[200px]">
              <p className="text-xs">Available in <strong>{lockTierName}</strong> plan — ask your account manager to upgrade.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </SidebarMenuItem>
    );
  }

  return <SidebarMenuItem>{button}</SidebarMenuItem>;
}

export function ClientPortalSidebar({ 
  activeTab, 
  onTabChange, 
  clientName, 
  businessName,
  onSignOut,
  badgeCounts,
  hiddenTabs = [],
  clientTier = "foundation",
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
    filterItems(items).map((item) => {
      const locked = !hasAccess(clientTier, item.minTier);
      return (
        <NavItem
          key={item.id}
          item={item}
          activeTab={activeTab}
          onTabChange={onTabChange}
          badgeCounts={badgeCounts}
          locked={locked}
          lockTierName={locked ? getUpgradeTierName(item.minTier) : undefined}
        />
      );
    });

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4 pb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-bold text-sm truncate max-w-[140px]">
              {businessName || "Client Portal"}
            </span>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {renderItems(allNavItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="mx-3 my-4 border-t border-border/40" />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {renderItems(secondaryItems)}
            </SidebarMenu>
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
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
