import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, LayoutDashboard, FileCheck, BarChart3, Receipt, FolderOpen, MessageCircle, Calendar, ClipboardList, Palette, Activity, Users, Package, FileSignature } from "lucide-react";
import { toast } from "@/hooks/use-toast";
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

export default function ClientPortal() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalUser, setPortalUser] = useState<ClientPortalUser | null>(null);
  const [clientAccount, setClientAccount] = useState<ClientAccount | null>(null);
  const [activeTab, setActiveTab] = useState("activity");

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !portalUser) {
    navigate("/portal/auth");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Client Portal</h1>
            {clientAccount && (
              <p className="text-sm text-muted-foreground">{clientAccount.business_name}</p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {portalUser.first_name} {portalUser.last_name}
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1 lg:inline-flex">
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Activity</span>
            </TabsTrigger>
            <TabsTrigger value="projects" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Projects</span>
            </TabsTrigger>
            <TabsTrigger value="messages" className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Messages</span>
            </TabsTrigger>
            <TabsTrigger value="meetings" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Meetings</span>
            </TabsTrigger>
            <TabsTrigger value="requests" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Requests</span>
            </TabsTrigger>
            <TabsTrigger value="approvals" className="flex items-center gap-2">
              <FileCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Approvals</span>
            </TabsTrigger>
            <TabsTrigger value="deliverables" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Deliverables</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Documents</span>
            </TabsTrigger>
            <TabsTrigger value="agreements" className="flex items-center gap-2">
              <FileSignature className="h-4 w-4" />
              <span className="hidden sm:inline">Agreements</span>
            </TabsTrigger>
            <TabsTrigger value="brand" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Brand</span>
            </TabsTrigger>
            <TabsTrigger value="team" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Team</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="invoices" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              <span className="hidden sm:inline">Invoices</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="activity">
            <ClientActivityTab />
          </TabsContent>

          <TabsContent value="projects">
            <ClientProjectsTab clientAccountId={portalUser.client_account_id} />
          </TabsContent>

          <TabsContent value="messages">
            <ClientMessagesTab 
              clientAccountId={portalUser.client_account_id} 
              clientName={`${portalUser.first_name || ''} ${portalUser.last_name || ''}`.trim() || undefined}
            />
          </TabsContent>

          <TabsContent value="meetings">
            <ClientMeetingsTab 
              clientAccountId={portalUser.client_account_id} 
              clientName={`${portalUser.first_name || ''} ${portalUser.last_name || ''}`.trim() || undefined}
            />
          </TabsContent>

          <TabsContent value="requests">
            <ClientRequestsTab clientAccountId={portalUser.client_account_id} />
          </TabsContent>
          
          <TabsContent value="approvals">
            <ClientContentApprovalTab clientAccountId={portalUser.client_account_id} />
          </TabsContent>

          <TabsContent value="deliverables">
            <ClientDeliverablesTab clientAccountId={portalUser.client_account_id} />
          </TabsContent>

          <TabsContent value="documents">
            <ClientDocumentsTab clientAccountId={portalUser.client_account_id} />
          </TabsContent>

          <TabsContent value="agreements">
            <ClientAgreementsTab clientAccountId={portalUser.client_account_id} />
          </TabsContent>

          <TabsContent value="brand">
            <ClientBrandAssetsTab clientAccountId={portalUser.client_account_id} />
          </TabsContent>

          <TabsContent value="team">
            <ClientTeamTab />
          </TabsContent>
          
          <TabsContent value="analytics">
            <ClientAnalyticsTab 
              clientAccountId={portalUser.client_account_id} 
              businessName={clientAccount?.business_name}
            />
          </TabsContent>
          
          <TabsContent value="invoices">
            <ClientInvoicesTab clientAccountId={portalUser.client_account_id} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
