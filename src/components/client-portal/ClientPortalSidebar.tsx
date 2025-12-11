import { 
  Activity, 
  Bell, 
  LayoutDashboard, 
  FileCheck, 
  BarChart3, 
  Receipt, 
  FolderOpen, 
  MessageCircle, 
  Calendar, 
  ClipboardList, 
  Palette, 
  Users, 
  Package, 
  FileSignature,
  LogOut,
  Sparkles,
  ChevronRight,
  HelpCircle,
  Settings
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
  | "requests" 
  | "approvals" 
  | "deliverables" 
  | "documents" 
  | "agreements" 
  | "brand" 
  | "team" 
  | "analytics" 
  | "invoices"
  | "help"
  | "settings";

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
}

const mainNavItems = [
  { id: "activity" as const, label: "Activity", icon: Activity },
  { id: "notifications" as const, label: "Wins & Updates", icon: Bell, badgeKey: "notifications" as const },
  { id: "projects" as const, label: "Projects", icon: LayoutDashboard },
  { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
];

const communicationItems = [
  { id: "messages" as const, label: "Messages", icon: MessageCircle, badgeKey: "messages" as const },
  { id: "meetings" as const, label: "Meetings", icon: Calendar },
  { id: "requests" as const, label: "Requests", icon: ClipboardList },
];

const contentItems = [
  { id: "approvals" as const, label: "Approvals", icon: FileCheck, badgeKey: "approvals" as const },
  { id: "deliverables" as const, label: "Deliverables", icon: Package },
  { id: "documents" as const, label: "Documents", icon: FolderOpen },
];

const accountItems = [
  { id: "agreements" as const, label: "Agreements", icon: FileSignature },
  { id: "brand" as const, label: "Brand Assets", icon: Palette },
  { id: "team" as const, label: "Team", icon: Users },
  { id: "invoices" as const, label: "Invoices", icon: Receipt },
  { id: "settings" as const, label: "Settings", icon: Settings },
  { id: "help" as const, label: "Help & Guide", icon: HelpCircle },
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
  // Hide badge when tab is active (user is viewing it) or when count is 0
  const showBadge = badgeCount > 0 && !isActive;
  
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        onClick={() => onTabChange(item.id)}
        tooltip={item.label}
        className={cn(
          "relative group/item transition-all duration-300 rounded-xl h-10",
          isActive 
            ? "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/20" 
            : "hover:bg-muted/80"
        )}
      >
        <item.icon className={cn(
          "h-4 w-4 transition-transform duration-300",
          isActive && "scale-110"
        )} />
        <span className="flex-1">{item.label}</span>
        {showBadge && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center bg-primary/10 text-primary">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
        {isActive && (
          <ChevronRight className="h-3.5 w-3.5 opacity-60" />
        )}
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
  badgeCounts 
}: ClientPortalSidebarProps) {
  const initials = clientName
    ?.split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "CL";

  return (
    <Sidebar collapsible="icon" className="border-r-0 bg-gradient-to-b from-sidebar-background to-sidebar-background/95">
      <SidebarHeader className="p-4 pb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-sidebar-background" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-bold text-sm truncate max-w-[140px]">
              {businessName || "Client Portal"}
            </span>
            <span className="text-[11px] text-muted-foreground font-medium">Premium Dashboard</span>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-3 space-y-6">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 px-3 mb-2">
            Overview
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {mainNavItems.map((item) => (
                <NavItem key={item.id} item={item} activeTab={activeTab} onTabChange={onTabChange} badgeCounts={badgeCounts} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 px-3 mb-2">
            Communication
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {communicationItems.map((item) => (
                <NavItem key={item.id} item={item} activeTab={activeTab} onTabChange={onTabChange} badgeCounts={badgeCounts} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 px-3 mb-2">
            Content
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {contentItems.map((item) => (
                <NavItem key={item.id} item={item} activeTab={activeTab} onTabChange={onTabChange} badgeCounts={badgeCounts} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 px-3 mb-2">
            Account
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {accountItems.map((item) => (
                <NavItem key={item.id} item={item} activeTab={activeTab} onTabChange={onTabChange} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 mt-auto">
        <div className="rounded-xl bg-gradient-to-r from-muted/80 to-muted/40 p-3 group-data-[collapsible=icon]:p-2">
          <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
            <Avatar className="h-9 w-9 ring-2 ring-primary/20 ring-offset-2 ring-offset-sidebar-background">
              <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground text-xs font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="text-sm font-semibold truncate">{clientName || "Client"}</p>
              <p className="text-[11px] text-muted-foreground">View profile</p>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onSignOut}
              className="h-8 w-8 shrink-0 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors group-data-[collapsible=icon]:hidden"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
