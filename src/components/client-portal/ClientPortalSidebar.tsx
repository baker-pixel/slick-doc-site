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
  | "team" 
  | "analytics" 
  | "invoices"
  | "help"
  | "settings"
  | "learning";

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
}

// Simplified: only the tabs clients actually use day-to-day
const primaryItems = [
  { id: "activity" as const, label: "Home", icon: Activity },
  { id: "projects" as const, label: "Projects", icon: LayoutDashboard },
  { id: "approvals" as const, label: "Approvals", icon: FileCheck, badgeKey: "approvals" as const },
  { id: "messages" as const, label: "Messages", icon: MessageCircle, badgeKey: "messages" as const },
  { id: "deliverables" as const, label: "Deliverables", icon: Package },
  { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
];

const secondaryItems = [
  { id: "notifications" as const, label: "Updates", icon: Bell, badgeKey: "notifications" as const },
  { id: "settings" as const, label: "Settings", icon: Settings },
];

interface NavItemProps {
  item: { id: PortalTab; label: string; icon: React.ComponentType<{ className?: string }>; badgeKey?: keyof BadgeCounts };
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

export function ClientPortalSidebar({ 
  activeTab, 
  onTabChange, 
  clientName, 
  businessName,
  onSignOut,
  badgeCounts,
  hiddenTabs = []
}: ClientPortalSidebarProps) {
  const filterItems = <T extends { id: string }>(items: T[]) => 
    items.filter(item => !hiddenTabs.includes(item.id));

  const initials = clientName
    ?.split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "CL";

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
        {/* Primary navigation — the stuff clients use daily */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {filterItems(primaryItems).map((item) => (
                <NavItem key={item.id} item={item} activeTab={activeTab} onTabChange={onTabChange} badgeCounts={badgeCounts} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Divider */}
        <div className="mx-3 my-4 border-t border-border/40" />

        {/* Secondary */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {filterItems(secondaryItems).map((item) => (
                <NavItem key={item.id} item={item} activeTab={activeTab} onTabChange={onTabChange} badgeCounts={badgeCounts} />
              ))}
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
