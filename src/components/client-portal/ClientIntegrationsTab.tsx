import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LinkedInOrganization {
  id: string;
  name: string;
  urn: string;
}

interface ClientIntegrationsTabProps {
  clientAccountId: string;
}

interface OAuthToken {
  id: string;
  platform: string;
  page_id: string | null;
  expires_at: string | null;
  created_at: string | null;
  token_metadata: Record<string, unknown> | null;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

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
    oauthUrl: "https://www.linkedin.com/oauth/v2/authorization",
    scopes: "w_member_social%20w_organization_social%20rw_organization_admin%20openid%20profile",
    callbackFn: "linkedin-oauth-callback",
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
    oauthUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    scopes: "pages_manage_posts%20pages_read_engagement",
    callbackFn: "facebook-oauth-callback",
    showPage: true,
    tokenLifeDays: 60,
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
    oauthUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    scopes: "instagram_basic%20instagram_content_publish%20pages_manage_posts%20pages_read_engagement",
    callbackFn: "instagram-oauth-callback",
    showPage: true,
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
    oauthUrl: "https://twitter.com/i/oauth2/authorize",
    scopes: "tweet.read%20tweet.write%20users.read%20offline.access",
    callbackFn: "twitter-oauth-callback",
    tokenLifeDays: null, // Twitter tokens don't expire
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

export function ClientIntegrationsTab({ clientAccountId }: ClientIntegrationsTabProps) {
  const [tokens, setTokens] = useState<OAuthToken[]>([]);
  const [oauthConfig, setOauthConfig] = useState<Record<string, { clientId: string; configured: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [selectingLinkedInPage, setSelectingLinkedInPage] = useState(false);
  const [savingLinkedInPage, setSavingLinkedInPage] = useState(false);
  const [linkedInOrganizations, setLinkedInOrganizations] = useState<LinkedInOrganization[]>([]);
  const [selectedLinkedInOrganization, setSelectedLinkedInOrganization] = useState<string>("");
  const [searchParams, setSearchParams] = useSearchParams();

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
    fetchOauthConfig();
  }, []);

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
      const organizations = Array.isArray(linkedInToken?.token_metadata?.organization_options)
        ? (linkedInToken?.token_metadata?.organization_options as LinkedInOrganization[])
        : [];

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

  const fetchOauthConfig = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("oauth-config");
      if (!error && data) {
        setOauthConfig(data as Record<string, { clientId: string; configured: boolean }>);
      }
    } catch (err) {
      console.error("Error fetching oauth config:", err);
    }
  };

  const handleConnect = (platform: (typeof PLATFORMS)[number]) => {
    const config = oauthConfig[platform.id];
    if (!config?.configured) {
      toast({
        title: "Not configured yet",
        description: `${platform.name} integration is not configured yet. Please contact your account manager.`,
        variant: "destructive",
      });
      return;
    }

    setConnecting(platform.id);
    const redirectUri = `${SUPABASE_URL}/functions/v1/${platform.callbackFn}`;
    const state = platform.id === "twitter"
      ? `${clientAccountId}|challenge`
      : clientAccountId;

    const url = new URL(platform.oauthUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", decodeURIComponent(platform.scopes));
    url.searchParams.set("state", state);

    if (platform.id === "twitter") {
      url.searchParams.set("code_challenge", "challenge");
      url.searchParams.set("code_challenge_method", "plain");
    }

    window.location.href = url.toString();
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
            organization_options: linkedInOrganizations,
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
                organization_options: linkedInOrganizations,
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
        <Badge variant="outline" className="self-start sm:self-auto gap-1.5 px-3 py-1.5 text-sm">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          {connectedCount} / {PLATFORMS.length} connected
        </Badge>
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

      {selectingLinkedInPage && linkedInOrganizations.length > 0 && (
        <Alert>
          <Building2 className="h-4 w-4" />
          <AlertTitle>Select your LinkedIn company page</AlertTitle>
          <AlertDescription className="space-y-4">
            <p>
              We found {linkedInOrganizations.length} company page{linkedInOrganizations.length === 1 ? "" : "s"} on your LinkedIn account.
              Choose which one this client should publish to.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select value={selectedLinkedInOrganization} onValueChange={setSelectedLinkedInOrganization}>
                <SelectTrigger className="sm:max-w-sm">
                  <SelectValue placeholder="Choose a company page" />
                </SelectTrigger>
                <SelectContent>
                  {linkedInOrganizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleLinkedInOrganizationSave} disabled={savingLinkedInPage || !selectedLinkedInOrganization}>
                {savingLinkedInPage ? "Saving..." : "Use this page"}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Platform Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {PLATFORMS.map((platform) => {
          const token = getToken(platform.id);
          const connected = !!token;
          const expired = connected && isExpired(token.expires_at);
          const selectionRequired = token?.token_metadata?.selection_required === true;
          const needsAction = !connected || expired;
          const Icon = platform.icon;
          const pageName = (typeof token?.token_metadata?.page_name === "string" ? token.token_metadata.page_name : token?.page_id) || null;

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
                          <TokenStatus expiresAt={token.expires_at} />
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
                      onClick={() => handleDisconnect(platform.id)}
                      disabled={disconnecting === platform.id}
                    >
                      <Unlink className="h-3.5 w-3.5" />
                      {disconnecting === platform.id ? "Disconnecting..." : "Disconnect"}
                    </Button>
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
        <button className="underline underline-offset-2 hover:text-foreground transition-colors">
          Contact your account manager.
        </button>
      </p>
    </div>
  );
}
