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
  Building2
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
  SidebarTrigger,
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
  | "invoices";

interface ClientPortalSidebarProps {
  activeTab: PortalTab;
  onTabChange: (tab: PortalTab) => void;
  clientName?: string;
  businessName?: string;
  onSignOut: () => void;
}

const mainNavItems = [
  { id: "activity" as const, label: "Activity", icon: Activity },
  { id: "notifications" as const, label: "Wins & Updates", icon: Bell },
  { id: "projects" as const, label: "Projects", icon: LayoutDashboard },
  { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
];

const communicationItems = [
  { id: "messages" as const, label: "Messages", icon: MessageCircle },
  { id: "meetings" as const, label: "Meetings", icon: Calendar },
  { id: "requests" as const, label: "Requests", icon: ClipboardList },
];

const contentItems = [
  { id: "approvals" as const, label: "Approvals", icon: FileCheck },
  { id: "deliverables" as const, label: "Deliverables", icon: Package },
  { id: "documents" as const, label: "Documents", icon: FolderOpen },
];

const accountItems = [
  { id: "agreements" as const, label: "Agreements", icon: FileSignature },
  { id: "brand" as const, label: "Brand Assets", icon: Palette },
  { id: "team" as const, label: "Team", icon: Users },
  { id: "invoices" as const, label: "Invoices", icon: Receipt },
];

export function ClientPortalSidebar({ 
  activeTab, 
  onTabChange, 
  clientName, 
  businessName,
  onSignOut 
}: ClientPortalSidebarProps) {
  const initials = clientName
    ?.split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "CL";

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-semibold text-sm truncate max-w-[140px]">
              {businessName || "Client Portal"}
            </span>
            <span className="text-xs text-muted-foreground">Dashboard</span>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2">
            Overview
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={activeTab === item.id}
                    onClick={() => onTabChange(item.id)}
                    tooltip={item.label}
                    className={cn(
                      "transition-all duration-200",
                      activeTab === item.id && "bg-primary/10 text-primary font-medium"
                    )}
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
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2">
            Communication
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {communicationItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={activeTab === item.id}
                    onClick={() => onTabChange(item.id)}
                    tooltip={item.label}
                    className={cn(
                      "transition-all duration-200",
                      activeTab === item.id && "bg-primary/10 text-primary font-medium"
                    )}
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
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2">
            Content
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {contentItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={activeTab === item.id}
                    onClick={() => onTabChange(item.id)}
                    tooltip={item.label}
                    className={cn(
                      "transition-all duration-200",
                      activeTab === item.id && "bg-primary/10 text-primary font-medium"
                    )}
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
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2">
            Account
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accountItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={activeTab === item.id}
                    onClick={() => onTabChange(item.id)}
                    tooltip={item.label}
                    className={cn(
                      "transition-all duration-200",
                      activeTab === item.id && "bg-primary/10 text-primary font-medium"
                    )}
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

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-medium truncate">{clientName || "Client"}</p>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onSignOut}
            className="h-8 w-8 shrink-0 group-data-[collapsible=icon]:hidden"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
