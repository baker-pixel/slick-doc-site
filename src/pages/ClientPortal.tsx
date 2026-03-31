import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";

import { Loader2, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { ClientPortalSidebar, type PortalTab, type BadgeCounts, type ClientTier } from "@/components/client-portal/ClientPortalSidebar";

import { usePortalPreferences } from "@/hooks/use-portal-preferences";

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
import { ClientHelpTab } from "@/components/client-portal/ClientHelpTab";
import { ClientSettingsTab } from "@/components/client-portal/ClientSettingsTab";
import { ClientLearningHubTab } from "@/components/client-portal/ClientLearningHubTab";
import { ClientAccessTab } from "@/components/client-portal/ClientAccessTab";
import { WelcomeModal } from "@/components/client-portal/WelcomeModal";
import { OnboardingTour } from "@/components/client-portal/OnboardingTour";

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
  activity: "Home",
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
  access: "Platform Access",
  team: "Your Team",
  analytics: "Analytics",
  invoices: "Invoices",
  help: "Help & Guide",
  settings: "Settings",
  learning: "Learning Hub",
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
  access: "Share your platform login credentials securely",
  team: "Meet your dedicated team",
  analytics: "View your performance metrics",
  invoices: "Manage billing and payments",
  help: "Learn how to use your portal",
  settings: "Customize your portal experience",
  learning: "Educational resources to grow your marketing knowledge",
};

export default function ClientPortal() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const [portalUser, setPortalUser] = useState<ClientPortalUser | null>(null);
  const [clientAccount, setClientAccount] = useState<ClientAccount | null>(null);
  
  const [badgeCounts, setBadgeCounts] = useState<BadgeCounts>({ notifications: 0, messages: 0, approvals: 0 });
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showTour, setShowTour] = useState(false);
  
  // Portal preferences hook
  const { preferences, updatePreferences, loading: preferencesLoading } = usePortalPreferences(user?.id);
  const [activeTab, setActiveTab] = useState<PortalTab>(preferences.default_landing_page || "activity");
  
  // Update active tab when preferences load
  useEffect(() => {
    if (!preferencesLoading && preferences.default_landing_page) {
      setActiveTab(preferences.default_landing_page);
    }
  }, [preferences.default_landing_page, preferencesLoading]);

  // Handle redirect in useEffect to avoid React warning
  useEffect(() => {
    if (shouldRedirect) {
      navigate("/portal/auth");
    }
  }, [shouldRedirect, navigate]);

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
        setShouldRedirect(true);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchPortalUser(session.user.id);
      } else {
        setLoading(false);
        setShouldRedirect(true);
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
        setShouldRedirect(true);
        setLoading(false);
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

      // Fetch badge counts for sidebar
      const [notifCount, messagesCount, approvalsCount] = await Promise.all([
        supabase
          .from("client_notifications")
          .select("*", { count: "exact", head: true })
          .eq("client_account_id", portalUserData.client_account_id)
          .eq("is_read", false),
        supabase
          .from("client_messages")
          .select("*", { count: "exact", head: true })
          .eq("client_account_id", portalUserData.client_account_id)
          .eq("is_read", false),
        supabase
          .from("content_approvals")
          .select("*", { count: "exact", head: true })
          .eq("client_account_id", portalUserData.client_account_id)
          .eq("status", "pending"),
      ]);

      const counts = {
        notifications: notifCount.count || 0,
        messages: messagesCount.count || 0,
        approvals: approvalsCount.count || 0,
      };
      
      setBadgeCounts(counts);
      

      // Check if this is the user's first visit
      const welcomeKey = `portal_welcome_seen_${portalUserData.user_id}`;
      const hasSeenWelcome = localStorage.getItem(welcomeKey);
      if (!hasSeenWelcome) {
        setShowWelcomeModal(true);
        localStorage.setItem(welcomeKey, "true");
      }
    } catch (error) {
      console.error("Error fetching portal user:", error);
      setShouldRedirect(true);
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
        return <ClientActivityTab clientAccountId={portalUser.client_account_id} />;
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
      case "access":
        return <ClientAccessTab clientAccountId={portalUser.client_account_id} />;
      case "team":
        return <ClientTeamTab clientAccountId={portalUser.client_account_id} />;
      case "analytics":
        return <ClientAnalyticsTab clientAccountId={portalUser.client_account_id} businessName={clientAccount?.business_name} />;
      case "invoices":
        return <ClientInvoicesTab clientAccountId={portalUser.client_account_id} />;
      case "help":
        return <ClientHelpTab onStartTour={handleStartTour} />;
      case "learning":
        return <ClientLearningHubTab clientAccountId={portalUser.client_account_id} />;
      case "settings":
        return (
          <ClientSettingsTab 
            userId={portalUser.user_id} 
            clientAccountId={portalUser.client_account_id} 
            onPreferencesChange={updatePreferences}
          />
        );
      default:
        return <ClientActivityTab clientAccountId={portalUser.client_account_id} />;
    }
  };

  const handleStartTour = () => {
    setShowTour(true);
  };

  const handleCloseTour = () => {
    setShowTour(false);
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-xl shadow-primary/20">
              <Sparkles className="h-8 w-8 text-primary-foreground animate-pulse" />
            </div>
            <div className="absolute inset-0 rounded-2xl bg-primary/20 animate-ping" />
          </div>
          <div className="text-center space-y-2">
            <p className="text-foreground font-semibold">Loading your dashboard</p>
            <p className="text-muted-foreground text-sm">Setting up your personalized experience...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user || !portalUser) {
    return null; // Redirect is handled by useEffect
  }

  return (
    <>
      {/* Welcome Modal for first-time users */}
      <WelcomeModal
        open={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
        onStartTour={handleStartTour}
        clientName={clientName}
        businessName={clientAccount?.business_name}
      />

      {/* Interactive Onboarding Tour */}
      <OnboardingTour
        active={showTour}
        onClose={handleCloseTour}
        onTabChange={setActiveTab}
        currentTab={activeTab}
      />

      <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-muted/20 via-background to-muted/30">
        <ClientPortalSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          clientName={clientName}
          businessName={clientAccount?.business_name}
          onSignOut={handleSignOut}
          badgeCounts={badgeCounts}
          hiddenTabs={preferences.hidden_tabs}
        />
        
        <SidebarInset className="flex-1">
          {/* Clean Header */}
          <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-xl">
            <div className="flex h-14 items-center gap-4 px-6">
              <SidebarTrigger className="md:hidden" />
              <h1 className="text-lg font-bold tracking-tight flex-1">{tabTitles[activeTab]}</h1>
            </div>
          </header>
          
          {/* Main Content */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <div className="animate-fade-in max-w-7xl mx-auto">
              {renderContent()}
            </div>
          </main>
        </SidebarInset>
      </div>
      </SidebarProvider>
    </>
  );
}
