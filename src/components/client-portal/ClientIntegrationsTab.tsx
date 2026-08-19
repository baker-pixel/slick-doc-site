import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import {
  Link2,
  Unlink,
  Linkedin,
  Instagram,
  Twitter,
  Facebook,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Plug,
  ShieldCheck,
  Info,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { completeWorkflowStep } from "@/lib/completeWorkflowStep";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface LinkedInOrganization {
  id: string;
  name: string;
  urn: string;
}

const parseLinkedInOrganizations = (value: unknown): LinkedInOrganization[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];

    const maybeOrg = item as Record<string, unknown>;
    if (
      typeof maybeOrg.id !== "string" ||
      typeof maybeOrg.name !== "string" ||
      typeof maybeOrg.urn !== "string"
    ) {
      return [];
    }

    return [{ id: maybeOrg.id, name: maybeOrg.name, urn: maybeOrg.urn }];
  });
};

const serializeLinkedInOrganizations = (organizations: LinkedInOrganization[]): Record<string, string>[] =>
  organizations.map((organization) => ({
    id: organization.id,
    name: organization.name,
    urn: organization.urn,
  }));

interface ClientIntegrationsTabProps {
  clientAccountId: string;
  onTabChange?: (tab: string) => void;
}

interface OAuthToken {
  id: string;
  platform: string;
  page_id: string | null;
  expires_at: string | null;
  created_at: string | null;
  token_metadata: Record<string, unknown> | null;
}

interface PfmAccount {
  id: string;
  platform: string;
  postforme_account_id: string;
  username: string | null;
  profile_photo_url: string | null;
  status: string;
  is_primary: boolean;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

// OAuth is fully handled by Post for Me (postforme-connect-account returns the
// provider auth URL) — platform entries here are display config only.
const PLATFORMS = [
  {
    id: "linkedin",
    name: "LinkedIn",
    icon: Linkedin,
    color: "text-[#0A66C2]",
    bgColor: "bg-[#0A66C2]/10",
    activeBorder: "border-[#0A66C2]/30",
    gradient: "from-[#0A66C2]/5 to-transparent",
    description: "Post updates, articles, and share content to your LinkedIn profile or company page.",
    tokenLifeDays: 60,
  },
  {
    id: "facebook",
    name: "Facebook",
    icon: Facebook,
    color: "text-[#1877F2]",
    bgColor: "bg-[#1877F2]/10",
    activeBorder: "border-[#1877F2]/30",
    gradient: "from-[#1877F2]/5 to-transparent",
    description: "Publish posts and manage content on your Facebook Page automatically.",
    tokenLifeDays: 60,
    note: "Requires a Facebook Business Page. During OAuth, select your Page and grant all permissions.",
  },
  {
    id: "instagram",
    name: "Instagram",
    icon: Instagram,
    color: "text-[#E4405F]",
    bgColor: "bg-[#E4405F]/10",
    activeBorder: "border-[#E4405F]/30",
    gradient: "from-[#E4405F]/5 to-transparent",
    description: "Schedule and publish posts to your Instagram Business account via the Meta API.",
    tokenLifeDays: 60,
    note: "Requires an Instagram Business account connected to a Facebook Page.",
  },
  {
    id: "twitter",
    name: "Twitter / X",
    icon: Twitter,
    color: "text-foreground",
    bgColor: "bg-muted",
    activeBorder: "border-border",
    gradient: "from-muted/50 to-transparent",
    description: "Automatically publish tweets and threads to your Twitter / X account.",
    tokenLifeDays: null as number | null, // Twitter tokens don't expire
  },
];

function getDaysRemaining(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function TokenStatus({ expiresAt }: { expiresAt: string | null }) {
  const days = getDaysRemaining(expiresAt);

  if (days === null) {
    return (
      <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/20 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Active
      </Badge>
    );
  }

  if (days <= 0) {
    return (
      <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600 border-red-500/20 gap-1">
        <AlertTriangle className="h-3 w-3" />
        Expired
      </Badge>
    );
  }

  if (days <= 7) {
    return (
      <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1">
        <Clock className="h-3 w-3" />
        Expires in {days}d
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/20 gap-1">
      <CheckCircle2 className="h-3 w-3" />
      Active · {days}d left
    </Badge>
  );
}

export function ClientIntegrationsTab({ clientAccountId, onTabChange }: ClientIntegrationsTabProps) {
  const [tokens, setTokens] = useState<OAuthToken[]>([]);
  const [pfmAccounts, setPfmAccounts] = useState<PfmAccount[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [selectingLinkedInPage, setSelectingLinkedInPage] = useState(false);
  const [savingLinkedInPage, setSavingLinkedInPage] = useState(false);
  const [linkedInOrganizations, setLinkedInOrganizations] = useState<LinkedInOrganization[]>([]);
  const [selectedLinkedInOrganization, setSelectedLinkedInOrganization] = useState<string>("");
  const [searchParams, setSearchParams] = useSearchParams();

  // PfM multi-account page picker (e.g. LinkedIn personal profile + several
  // company pages, all connected as separate rows with no inherent "the one").
  const [pfmPickerPlatform, setPfmPickerPlatform] = useState<string | null>(null);
  const [selectedPfmAccountId, setSelectedPfmAccountId] = useState<string>("");
  const [savingPfmPrimary, setSavingPfmPrimary] = useState(false);

  // Tracks the platform + popup window of an in-progress connect attempt so
  // we can tell the user plainly when it silently failed (e.g. Instagram
  // OAuth completing but no linked Business account existing to attach).
  const attemptedPlatformRef = useRef<string | null>(null);
  const connectPopupRef = useRef<Window | null>(null);

  useEffect(() => {
    // Handle OAuth callback return
    const connected = searchParams.get("connected");
    const success = searchParams.get("success");
    const errorMsg = searchParams.get("error");
    const linkedInNeedsSelection = searchParams.get("linkedin_select") === "true";
    const linkedInOrgsRaw = searchParams.get("linkedin_orgs");

    if (linkedInNeedsSelection && linkedInOrgsRaw) {
      try {
        const parsed = JSON.parse(decodeURIComponent(linkedInOrgsRaw)) as LinkedInOrganization[];
        if (parsed.length > 0) {
          setLinkedInOrganizations(parsed);
          setSelectedLinkedInOrganization(parsed[0].id);
          setSelectingLinkedInPage(true);
        }
      } catch (err) {
        console.error("Failed to parse LinkedIn organizations:", err);
      }

      const next = new URLSearchParams(searchParams);
      next.delete("linkedin_select");
      next.delete("linkedin_orgs");
      setSearchParams(next, { replace: true });
      return;
    }

    if (connected && success === "true") {
      const platformName = PLATFORMS.find((p) => p.id === connected)?.name || connected;
      toast({
        title: `${platformName} connected`,
        description: "Your account is now connected and ready for automated posting.",
      });
      const next = new URLSearchParams(searchParams);
      next.delete("connected");
      next.delete("success");
      setSearchParams(next, { replace: true });

      // Complete the client_oauth workflow step now that a real account is connected
      completeWorkflowStep(clientAccountId, "client_oauth")
        .then((completed) => {
          // Onboarding step done -- take them straight to the next one
          // (Approve Your First Content Draft) instead of leaving them here.
          if (completed) onTabChange?.("approvals");
        })
        .catch((e) => console.error("Failed to complete OAuth workflow step:", e));
    }

    if (errorMsg) {
      toast({
        title: "Connection failed",
        description: decodeURIComponent(errorMsg),
        variant: "destructive",
      });
      const next = new URLSearchParams(searchParams);
      next.delete("error");
      setSearchParams(next, { replace: true });
    }

    fetchTokens();
    fetchPfmAccounts();
  }, [clientAccountId]);

  // Auto-sync + refresh when window regains focus (after OAuth tab closes)
  useEffect(() => {
    let lastFocusAt = 0;
    const onFocus = async () => {
      // Debounce — ignore rapid re-triggers (< 2s apart)
      const now = Date.now();
      if (now - lastFocusAt < 2000) return;
      lastFocusAt = now;

      // Pull fresh data from DB first (fast)
      let accounts = await fetchPfmAccounts();
      // Then do a full PfM sync in the background so newly connected accounts appear
      try {
        await supabase.functions.invoke("postforme-sync-accounts", {
          body: { clientId: clientAccountId },
        });
        accounts = await fetchPfmAccounts();
      } catch { /* silent — user can click Sync manually */ }

      // Only judge an in-progress connect attempt once its popup/tab has
      // actually closed — a stray focus event while it's still open would
      // otherwise report a false "didn't connect".
      const attempted = attemptedPlatformRef.current;
      const popup = connectPopupRef.current;
      if (attempted && (!popup || popup.closed)) {
        attemptedPlatformRef.current = null;
        connectPopupRef.current = null;
        const connected = accounts.some((a) => a.platform === attempted && a.status === "connected");
        const platform = PLATFORMS.find((p) => p.id === attempted);
        if (!connected) {
          toast({
            title: `${platform?.name ?? attempted} didn't connect`,
            description: platform?.note
              ? `The connection didn't finish. ${platform.note}`
              : "The connection didn't finish. Please try again.",
            variant: "destructive",
          });
        } else {
          // A single OAuth grant can return several pages/profiles for one
          // platform (confirmed live: a LinkedIn auth returned 3 company
          // pages) with no inherent "the one" until the client picks a
          // primary. Advancing onboarding immediately here used to race
          // ahead of that pick every time -- the wizard yanked the client
          // to "Approve Your First Content Draft" before they'd chosen a
          // page, with no way back to the picker. Open the picker instead
          // and let handlePfmPrimarySave complete the step once they've
          // actually resolved which page to use.
          const platformAccounts = accounts.filter((a) => a.platform === attempted);
          const needsPagePick = platformAccounts.length > 1 && !platformAccounts.some((a) => a.is_primary);

          if (needsPagePick) {
            toast({
              title: `${platform?.name ?? attempted} connected — choose a page`,
              description: "This account manages more than one page. Pick which one to publish to.",
            });
            // Not openPfmPagePicker() -- it'd default-select the current
            // primary from this effect's own (possibly stale) pfmAccounts
            // closure. fetchPfmAccounts() above already pushed the fresh
            // list into state; leave the radio unselected so the client
            // picks explicitly instead of silently keeping whatever
            // happened to land first.
            setSelectedPfmAccountId("");
            setPfmPickerPlatform(attempted);
            return;
          }

          // This is the ONLY place a successful PfM connection is ever
          // detected -- PfM's own post-connect redirect (configured in
          // their dashboard, not in this codebase) doesn't land back on a
          // route that reads its isSuccess/accountIds params, so nothing
          // upstream of this focus-based DB check ever fires. Completing
          // the workflow step here, not there, is what actually advances
          // onboarding past "connect a social account".
          toast({
            title: `${platform?.name ?? attempted} connected`,
            description: "Your account is now connected and ready for automated posting.",
          });
          completeWorkflowStep(clientAccountId, "client_oauth")
            .then((completed) => {
              // Onboarding step done -- take them straight to the next one
              // (Approve Your First Content Draft) instead of leaving them here.
              if (completed) onTabChange?.("approvals");
            })
            .catch((e) => console.error("Failed to complete OAuth workflow step:", e));
        }
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [clientAccountId]);

  const fetchTokens = async () => {
    try {
      const { data, error } = await supabase
        .from("client_oauth_tokens")
        .select("id, platform, page_id, expires_at, created_at, token_metadata")
        .eq("client_id", clientAccountId);

      if (error) throw error;
      const nextTokens = (data as OAuthToken[]) || [];
      setTokens(nextTokens);

      const linkedInToken = nextTokens.find((token) => token.platform === "linkedin");
      const selectionRequired = linkedInToken?.token_metadata?.selection_required === true;
      const organizations = parseLinkedInOrganizations(linkedInToken?.token_metadata?.organization_options);

      if (selectionRequired && organizations.length > 0) {
        setLinkedInOrganizations(organizations);
        setSelectedLinkedInOrganization(organizations[0]?.id || "");
        setSelectingLinkedInPage(true);
      }
    } catch (err) {
      console.error("Error fetching oauth tokens:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPfmAccounts = async () => {
    const { data } = await supabase
      .from("client_postforme_accounts")
      .select("id, platform, postforme_account_id, username, profile_photo_url, status, is_primary")
      .eq("client_id", clientAccountId)
      .eq("status", "connected")
      .order("created_at", { ascending: true });
    const accounts = (data as PfmAccount[]) || [];
    setPfmAccounts(accounts);
    return accounts;
  };

  const getPfmAccountsForPlatform = (platformId: string) =>
    pfmAccounts.filter((a) => a.platform === platformId);

  // The one used for publishing: the client's explicit pick if they've made
  // one, else the first connected (stable — query is ordered by created_at).
  const getPfmAccount = (platformId: string) => {
    const accounts = getPfmAccountsForPlatform(platformId);
    return accounts.find((a) => a.is_primary) ?? accounts[0] ?? null;
  };

  const openPfmPagePicker = (platformId: string) => {
    const current = getPfmAccount(platformId);
    setSelectedPfmAccountId(current?.postforme_account_id ?? "");
    setPfmPickerPlatform(platformId);
  };

  const handlePfmPrimarySave = async () => {
    if (!pfmPickerPlatform || !selectedPfmAccountId) return;
    setSavingPfmPrimary(true);
    try {
      const { data, error } = await supabase.functions.invoke("postforme-set-primary-account", {
        body: { clientId: clientAccountId, platform: pfmPickerPlatform, pfmAccountId: selectedPfmAccountId },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Please try again.");
      }
      await fetchPfmAccounts();
      const account = getPfmAccountsForPlatform(pfmPickerPlatform).find((a) => a.postforme_account_id === selectedPfmAccountId);
      toast({
        title: "Page selected",
        description: `${account?.username ?? "That page"} is now used for publishing.`,
      });
      setPfmPickerPlatform(null);

      // If this pick was what onboarding was waiting on (see the onFocus
      // handler above), this is what actually advances it now that the
      // ambiguity is resolved. No-ops harmlessly for a client who's already
      // past onboarding and is just changing their page later --
      // completeWorkflowStep only fires on a still-pending step.
      completeWorkflowStep(clientAccountId, "client_oauth")
        .then((completed) => {
          if (completed) onTabChange?.("approvals");
        })
        .catch((e) => console.error("Failed to complete OAuth workflow step:", e));
    } catch (err) {
      toast({
        title: "Could not save selection",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingPfmPrimary(false);
    }
  };

  const handleConnect = async (platform: (typeof PLATFORMS)[number]) => {
    setConnecting(platform.id);
    try {
      const { data, error } = await supabase.functions.invoke("postforme-connect-account", {
        body: {
          clientId: clientAccountId,
          platform: platform.id,
          permissions: ["posts", "feeds"],
        },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Unable to start OAuth flow");
      }

      // Store clientId so the callback popup can sync the right client
      localStorage.setItem("pfm_oauth_client_id", clientAccountId);

      // Open as a real popup window (not a tab) so window.close() works reliably
      // and the main window stays on the social tab throughout the OAuth flow
      const screenLeft = window.screenLeft ?? window.screenX;
      const screenTop = window.screenTop ?? window.screenY;
      const popupWidth = 600;
      const popupHeight = 700;
      const left = screenLeft + (window.outerWidth - popupWidth) / 2;
      const top = screenTop + (window.outerHeight - popupHeight) / 2;
      const popup = window.open(
        data.url,
        "pfm_oauth",
        `width=${popupWidth},height=${popupHeight},left=${left},top=${top},scrollbars=yes,resizable=yes`
      );

      let handle = popup;
      if (!popup || popup.closed) {
        // Browser blocked the popup — fall back to new tab with a warning
        handle = window.open(data.url, "_blank");
        toast({
          title: `${platform.name} — complete in the new tab`,
          description: "Allow popups for this site to improve the connect experience. After connecting, come back here.",
          variant: "default",
        });
      } else {
        toast({
          title: `${platform.name} — authorize in the popup`,
          description: "Complete the connection in the popup. This page will update automatically when done.",
        });
      }

      if (handle) {
        attemptedPlatformRef.current = platform.id;
        connectPopupRef.current = handle;
      }
    } catch (err: unknown) {
      toast({
        title: "Connection failed",
        description: err instanceof Error ? err.message : "Unable to start OAuth flow",
        variant: "destructive",
      });
    } finally {
      setConnecting(null);
    }
  };

  const handleSyncAccounts = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("postforme-sync-accounts", {
        body: { clientId: clientAccountId },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Unknown error");
      }
      await fetchPfmAccounts();
      toast({ title: "Synced", description: `${data?.synced ?? 0} account${data?.synced === 1 ? "" : "s"} updated` });
    } catch (err: unknown) {
      toast({ title: "Sync failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnectPfm = async (platformId: string) => {
    const pfmAccount = getPfmAccount(platformId);
    if (!pfmAccount) return;
    setDisconnecting(platformId);
    try {
      const { data, error } = await supabase.functions.invoke("postforme-disconnect-account", {
        body: {
          clientId: clientAccountId,
          platform: platformId,
          pfmAccountId: pfmAccount.postforme_account_id,
        },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Unknown error");
      }
      await fetchPfmAccounts();
      toast({ title: "Disconnected" });
    } catch (err: unknown) {
      toast({ title: "Disconnect failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDisconnecting(null);
    }
  };

  /** Reopen the company-page picker for an already-connected LinkedIn token,
      pre-selecting the page currently in use. */
  const openLinkedInPagePicker = () => {
    const token = tokens.find((t) => t.platform === "linkedin");
    const organizations = parseLinkedInOrganizations(token?.token_metadata?.organization_options);
    if (!token || organizations.length === 0) return;

    const currentId = typeof token.token_metadata?.organization_id === "string"
      ? token.token_metadata.organization_id
      : "";
    setLinkedInOrganizations(organizations);
    setSelectedLinkedInOrganization(
      organizations.some((org) => org.id === currentId) ? currentId : organizations[0].id,
    );
    setSelectingLinkedInPage(true);
  };

  const handleLinkedInOrganizationSave = async () => {
    const token = tokens.find((t) => t.platform === "linkedin");
    const organization = linkedInOrganizations.find((org) => org.id === selectedLinkedInOrganization);

    if (!token || !organization) {
      toast({
        title: "Unable to save selection",
        description: "Reconnect LinkedIn and choose your company page again.",
        variant: "destructive",
      });
      return;
    }

    setSavingLinkedInPage(true);
    try {
      const { error } = await supabase
        .from("client_oauth_tokens")
        .update({
          page_id: organization.urn,
          token_metadata: {
            ...(token.token_metadata || {}),
            page_name: organization.name,
            organization_id: organization.id,
            organization_urn: organization.urn,
            selection_required: false,
            organization_options: serializeLinkedInOrganizations(linkedInOrganizations),
          },
        })
        .eq("id", token.id);

      if (error) throw error;

      setTokens((prev) => prev.map((item) => (
        item.id === token.id
          ? {
              ...item,
              page_id: organization.urn,
              token_metadata: {
                ...(item.token_metadata || {}),
                page_name: organization.name,
                organization_id: organization.id,
                organization_urn: organization.urn,
                selection_required: false,
                organization_options: serializeLinkedInOrganizations(linkedInOrganizations),
              },
            }
          : item
      )));

      setSelectingLinkedInPage(false);
      setLinkedInOrganizations([]);
      setSelectedLinkedInOrganization("");
      toast({
        title: "LinkedIn page selected",
        description: `${organization.name} is now the company page used for publishing.`,
      });
    } catch (err) {
      console.error("Error saving LinkedIn organization:", err);
      toast({
        title: "Could not save company page",
        description: "Please try reconnecting LinkedIn.",
        variant: "destructive",
      });
    } finally {
      setSavingLinkedInPage(false);
    }
  };

  const handleDisconnect = async (platformId: string) => {
    const token = tokens.find((t) => t.platform === platformId);
    if (!token) return;

    setDisconnecting(platformId);
    try {
      const { error } = await supabase
        .from("client_oauth_tokens")
        .delete()
        .eq("id", token.id);

      if (error) throw error;

      setTokens((prev) => prev.filter((t) => t.id !== token.id));
      const platformName = PLATFORMS.find((p) => p.id === platformId)?.name || platformId;
      toast({
        title: "Account disconnected",
        description: `Your ${platformName} account has been disconnected.`,
      });
    } catch (err) {
      console.error("Error disconnecting:", err);
      toast({
        title: "Error",
        description: "Failed to disconnect. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDisconnecting(null);
    }
  };

  const getToken = (platformId: string) => tokens.find((t) => t.platform === platformId);

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const connectedCount = PLATFORMS.filter((p) => {
    if (getPfmAccount(p.id)) return true;
    const t = getToken(p.id);
    return t && !isExpired(t.expires_at);
  }).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Plug className="h-5 w-5 text-primary" />
            Connected Accounts
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your social media accounts to enable automated posting on your behalf.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="self-start sm:self-auto gap-1.5 px-3 py-1.5 text-sm">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            {connectedCount} / {PLATFORMS.length} connected
          </Badge>
          <Button variant="outline" size="sm" onClick={handleSyncAccounts} disabled={syncing}>
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", syncing && "animate-spin")} />
            {syncing ? "Syncing..." : "Sync"}
          </Button>
        </div>
      </div>

      {/* Security Note */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/40 border border-border/50">
        <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Your credentials are stored securely.</span>{" "}
          We use OAuth 2.0 — we never store your passwords. You can disconnect at any time.
          Tokens are encrypted at rest and only used to publish content you've approved.
        </div>
      </div>

      {/* LinkedIn company page picker — pops up after OAuth when the account
          manages more than one company page */}
      <Dialog
        open={selectingLinkedInPage && linkedInOrganizations.length > 0}
        onOpenChange={(open) => {
          if (!open && !savingLinkedInPage) setSelectingLinkedInPage(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-[#0A66C2]/10">
                <Linkedin className="h-5 w-5 text-[#0A66C2]" />
              </div>
              Which company page should we post to?
            </DialogTitle>
            <DialogDescription>
              Your LinkedIn account manages {linkedInOrganizations.length} company page{linkedInOrganizations.length === 1 ? "" : "s"}.
              Select the one you want connected — all approved posts will be published there.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-64 overflow-y-auto py-1" role="radiogroup" aria-label="LinkedIn company pages">
            {linkedInOrganizations.map((org) => {
              const selected = selectedLinkedInOrganization === org.id;
              return (
                <button
                  key={org.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSelectedLinkedInOrganization(org.id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                    selected
                      ? "border-[#0A66C2] bg-[#0A66C2]/5 ring-1 ring-[#0A66C2]/30"
                      : "border-border/60 hover:border-border hover:bg-muted/50"
                  )}
                >
                  <div className={cn("p-2 rounded-lg shrink-0", selected ? "bg-[#0A66C2]/10" : "bg-muted")}>
                    <Building2 className={cn("h-4 w-4", selected ? "text-[#0A66C2]" : "text-muted-foreground")} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{org.name}</p>
                    <p className="text-xs text-muted-foreground">Company page</p>
                  </div>
                  {selected && <CheckCircle2 className="h-4 w-4 text-[#0A66C2] shrink-0" />}
                </button>
              );
            })}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setSelectingLinkedInPage(false)}
              disabled={savingLinkedInPage}
            >
              Decide later
            </Button>
            <Button
              onClick={handleLinkedInOrganizationSave}
              disabled={savingLinkedInPage || !selectedLinkedInOrganization}
              className="gap-1.5"
            >
              {savingLinkedInPage ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Connect this page"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PfM multi-account page picker — a platform (usually LinkedIn) can have
          several connected pages/profiles with no inherent "the one"; this
          lets the client say explicitly which page gets published to. */}
      <Dialog
        open={pfmPickerPlatform !== null}
        onOpenChange={(open) => { if (!open && !savingPfmPrimary) setPfmPickerPlatform(null); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Which page should we post to?
            </DialogTitle>
            <DialogDescription>
              {pfmPickerPlatform && (
                <>Your {PLATFORMS.find((p) => p.id === pfmPickerPlatform)?.name} account has {getPfmAccountsForPlatform(pfmPickerPlatform).length} connected pages/profiles.
                Select the one you want used for publishing.</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-64 overflow-y-auto py-1" role="radiogroup" aria-label="Connected pages">
            {pfmPickerPlatform && getPfmAccountsForPlatform(pfmPickerPlatform).map((account) => {
              const selected = selectedPfmAccountId === account.postforme_account_id;
              return (
                <button
                  key={account.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSelectedPfmAccountId(account.postforme_account_id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border/60 hover:border-border hover:bg-muted/50"
                  )}
                >
                  <div className={cn("p-2 rounded-lg shrink-0", selected ? "bg-primary/10" : "bg-muted")}>
                    <Building2 className={cn("h-4 w-4", selected ? "text-primary" : "text-muted-foreground")} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{account.username ?? "Untitled page"}</p>
                  </div>
                  {selected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setPfmPickerPlatform(null)} disabled={savingPfmPrimary}>
              Cancel
            </Button>
            <Button onClick={handlePfmPrimarySave} disabled={savingPfmPrimary || !selectedPfmAccountId} className="gap-1.5">
              {savingPfmPrimary ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Use this page"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Platform Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {PLATFORMS.map((platform) => {
          const pfmAccount = getPfmAccount(platform.id);
          const token = getToken(platform.id);
          const connected = !!pfmAccount || (!!token && !isExpired(token.expires_at));
          const expired = !pfmAccount && !!token && isExpired(token.expires_at);
          const selectionRequired = !pfmAccount && token?.token_metadata?.selection_required === true;
          const needsAction = !connected || expired;
          const Icon = platform.icon;
          const pageName = pfmAccount?.username
            || (typeof token?.token_metadata?.page_name === "string" ? token.token_metadata.page_name : token?.page_id)
            || null;
          // Direct-token LinkedIn connections keep the full page list in
          // metadata, so the user can switch pages without reconnecting
          const linkedInPageOptions = platform.id === "linkedin" && !pfmAccount
            ? parseLinkedInOrganizations(token?.token_metadata?.organization_options)
            : [];
          const pfmAccountsForThisPlatform = getPfmAccountsForPlatform(platform.id);

          return (
            <Card
              key={platform.id}
              className={cn(
                "relative overflow-hidden border transition-all duration-200",
                connected && !expired
                  ? `${platform.activeBorder} shadow-sm`
                  : "border-border/50"
              )}
            >
              {/* Gradient accent */}
              {connected && !expired && (
                <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", platform.gradient.replace("from-", "from-").replace("to-transparent", `to-${platform.color.replace("text-", "")}`))} />
              )}

              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2.5 rounded-xl shrink-0", platform.bgColor)}>
                      <Icon className={cn("h-5 w-5", platform.color)} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{platform.name}</CardTitle>
                       {connected && !expired && !selectionRequired ? (
                        <div className="mt-1">
                          {token ? (
                            <TokenStatus expiresAt={token.expires_at} />
                          ) : (
                            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/20 gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Connected
                            </Badge>
                          )}
                        </div>
                       ) : selectionRequired ? (
                         <Badge variant="outline" className="mt-1 text-xs gap-1">
                           <Building2 className="h-3 w-3" />
                           Choose company page
                         </Badge>
                      ) : expired ? (
                        <Badge variant="outline" className="mt-1 text-xs bg-red-500/10 text-red-600 border-red-500/20 gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Token expired
                        </Badge>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">Not connected</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {platform.description}
                </p>

                {/* Page / Account Info */}
                {connected && !expired && !selectionRequired && pageName && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 text-sm">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    <span className="text-muted-foreground">Page:</span>
                    <span className="font-medium truncate">{pageName}</span>
                    {pfmAccountsForThisPlatform.length > 1 && (
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">
                        1 of {pfmAccountsForThisPlatform.length} connected
                      </span>
                    )}
                  </div>
                )}

                {/* Note (e.g. Instagram requirement) */}
                {platform.note && needsAction && (
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{platform.note}</span>
                  </div>
                )}

                {/* Token lifetime info */}
                {!connected && platform.tokenLifeDays && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>Authorization lasts {platform.tokenLifeDays} days — we'll remind you before it expires.</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-1">
                  {connected && !expired && !selectionRequired ? (
                    <>
                      {linkedInPageOptions.length > 1 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 rounded-lg"
                          onClick={openLinkedInPagePicker}
                        >
                          <Building2 className="h-3.5 w-3.5" />
                          Change page
                        </Button>
                      )}
                      {pfmAccountsForThisPlatform.length > 1 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 rounded-lg"
                          onClick={() => openPfmPagePicker(platform.id)}
                        >
                          <Building2 className="h-3.5 w-3.5" />
                          Change page
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
                        onClick={() => pfmAccount ? handleDisconnectPfm(platform.id) : handleDisconnect(platform.id)}
                        disabled={disconnecting === platform.id}
                      >
                        <Unlink className="h-3.5 w-3.5" />
                        {disconnecting === platform.id ? "Disconnecting..." : "Disconnect"}
                      </Button>
                    </>
                  ) : expired ? (
                    <Button
                      size="sm"
                      className="gap-1.5 rounded-lg"
                      onClick={() => handleConnect(platform)}
                      disabled={connecting === platform.id}
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", connecting === platform.id && "animate-spin")} />
                      Reconnect
                    </Button>
                  ) : selectionRequired && platform.id === "linkedin" ? (
                    <Button
                      size="sm"
                      className="gap-1.5 rounded-lg"
                      onClick={() => setSelectingLinkedInPage(true)}
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      Choose page
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 rounded-lg"
                      onClick={() => handleConnect(platform)}
                      disabled={connecting === platform.id}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      {connecting === platform.id ? "Redirecting..." : "Connect"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground text-center pb-2">
        Questions about connected accounts?{" "}
        <button
          type="button"
          onClick={() => window.open("mailto:hello@orangedoormarketing.com?subject=Question%20about%20connected%20accounts", "_blank")}
          className="underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Contact your account manager.
        </button>
      </p>
    </div>
  );
}
