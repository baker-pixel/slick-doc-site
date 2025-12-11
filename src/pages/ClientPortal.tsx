import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Bell, Menu } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { ClientPortalSidebar, type PortalTab } from "@/components/client-portal/ClientPortalSidebar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Tab Components
import ClientProjectsTab from "@/components/client-portal/ClientProjectsTab";
import ClientContentApprovalTab from "@/components/client-portal/ClientContentApprovalTab";
import ClientAnalyticsTab from "@/components/client-portal/ClientAnalyticsTab";
import ClientInvoicesTab from "@/components/client-portal/ClientInvoicesTab";
import ClientDocumentsTab from "@/components/client-portal/ClientDocumentsTab";
import ClientMessagesTab from "@/components/client-portal/ClientMessagesTab";
import ClientMeetingsTab from "@/components/client-portal/ClientMeetingsTab";
import ClientRequestsTab from "@/components/client-portal/ClientRequestsTab";
import ClientBrandAssetsTab from "@/components/client-portal/ClientBrandAssetsTab";
import { ClientActivityTab } from "@/components/client-portal/ClientActivityTab";
import { ClientTeamTab } from "@/components/client-portal/ClientTeamTab";
import { ClientDeliverablesTab } from "@/components/client-portal/ClientDeliverablesTab";
import { ClientAgreementsTab } from "@/components/client-portal/ClientAgreementsTab";
import ClientNotificationsTab from "@/components/client-portal/ClientNotificationsTab";

interface ClientPortalUser {
  id: string;
  user_id: string;
  client_account_id: string;
  first_name: string | null;
  last_name: string | null;
}

interface ClientAccount {
  id: string;
  business_name: string;
  email: string;
  tier: string;
}

const tabTitles: Record<PortalTab, string> = {
  activity: "Activity Feed",
  notifications: "Wins & Updates",
  projects: "Projects",
  messages: "Messages",
  meetings: "Meetings",
  requests: "Requests",
  approvals: "Content Approvals",
  deliverables: "Deliverables",
  documents: "Documents",
  agreements: "Agreements",
  brand: "Brand Assets",
  team: "Your Team",
  analytics: "Analytics",
  invoices: "Invoices",
};

const tabDescriptions: Record<PortalTab, string> = {
  activity: "See recent activity on your account",
  notifications: "Celebrate your wins and stay updated",
  projects: "Track your active projects and milestones",
  messages: "Communicate with your marketing team",
  meetings: "Schedule and manage your meetings",
  requests: "Submit and track your requests",
  approvals: "Review and approve content",
  deliverables: "Access your completed deliverables",
  documents: "View and download your documents",
  agreements: "Manage your service agreements",
  brand: "Access your brand assets and guidelines",
  team: "Meet your dedicated team",
  analytics: "View your performance metrics",
  invoices: "Manage billing and payments",
};

export default function ClientPortal() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalUser, setPortalUser] = useState<ClientPortalUser | null>(null);
  const [clientAccount, setClientAccount] = useState<ClientAccount | null>(null);
  const [activeTab, setActiveTab] = useState<PortalTab>("activity");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setTimeout(() => {
          fetchPortalUser(session.user.id);
        }, 0);
      } else {
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchPortalUser(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchPortalUser = async (userId: string) => {
    try {
      const { data: portalUserData, error: portalError } = await supabase
        .from("client_portal_users")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (portalError || !portalUserData) {
        navigate("/portal/auth");
        return;
      }

      setPortalUser(portalUserData);

      const { data: accountData, error: accountError } = await supabase
        .from("client_accounts")
        .select("id, business_name, email, tier")
        .eq("id", portalUserData.client_account_id)
        .single();

      if (!accountError && accountData) {
        setClientAccount(accountData);
      }
    } catch (error) {
      console.error("Error fetching portal user:", error);
      navigate("/portal/auth");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/portal/auth");
  };

  const clientName = portalUser 
    ? `${portalUser.first_name || ''} ${portalUser.last_name || ''}`.trim() || undefined
    : undefined;

  const renderContent = () => {
    if (!portalUser) return null;

    switch (activeTab) {
      case "activity":
        return <ClientActivityTab />;
      case "notifications":
        return <ClientNotificationsTab clientAccountId={portalUser.client_account_id} />;
      case "projects":
        return <ClientProjectsTab clientAccountId={portalUser.client_account_id} />;
      case "messages":
        return <ClientMessagesTab clientAccountId={portalUser.client_account_id} clientName={clientName} />;
      case "meetings":
        return <ClientMeetingsTab clientAccountId={portalUser.client_account_id} clientName={clientName} />;
      case "requests":
        return <ClientRequestsTab clientAccountId={portalUser.client_account_id} />;
      case "approvals":
        return <ClientContentApprovalTab clientAccountId={portalUser.client_account_id} />;
      case "deliverables":
        return <ClientDeliverablesTab clientAccountId={portalUser.client_account_id} />;
      case "documents":
        return <ClientDocumentsTab clientAccountId={portalUser.client_account_id} />;
      case "agreements":
        return <ClientAgreementsTab clientAccountId={portalUser.client_account_id} />;
      case "brand":
        return <ClientBrandAssetsTab clientAccountId={portalUser.client_account_id} />;
      case "team":
        return <ClientTeamTab />;
      case "analytics":
        return <ClientAnalyticsTab clientAccountId={portalUser.client_account_id} businessName={clientAccount?.business_name} />;
      case "invoices":
        return <ClientInvoicesTab clientAccountId={portalUser.client_account_id} />;
      default:
        return <ClientActivityTab />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Loading your portal...</p>
        </div>
      </div>
    );
  }

  if (!user || !portalUser) {
    navigate("/portal/auth");
    return null;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/30">
        <ClientPortalSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          clientName={clientName}
          businessName={clientAccount?.business_name}
          onSignOut={handleSignOut}
        />
        
        <SidebarInset className="flex-1">
          {/* Header */}
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
            <SidebarTrigger className="md:hidden" />
            
            <div className="flex-1">
              <h1 className="text-lg font-semibold">{tabTitles[activeTab]}</h1>
              <p className="text-sm text-muted-foreground hidden sm:block">
                {tabDescriptions[activeTab]}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search..." 
                  className="w-64 pl-9 bg-muted/50 border-0 focus-visible:ring-1"
                />
              </div>
              
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 h-4 w-4 bg-primary text-primary-foreground text-[10px] font-medium rounded-full flex items-center justify-center">
                  3
                </span>
              </Button>
            </div>
          </header>
          
          {/* Main Content */}
          <main className="flex-1 p-6">
            <div className="animate-fade-in">
              {renderContent()}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
