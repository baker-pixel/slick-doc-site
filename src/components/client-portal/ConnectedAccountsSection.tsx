import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Link2, Unlink, Linkedin, Instagram, Twitter, Facebook } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConnectedAccountsSectionProps {
  clientAccountId: string;
}

interface OAuthToken {
  id: string;
  platform: string;
  page_id: string | null;
  expires_at: string | null;
  created_at: string | null;
}

const platforms = [
  {
    id: "linkedin",
    name: "LinkedIn",
    icon: Linkedin,
    color: "text-[#0A66C2]",
    bgColor: "bg-[#0A66C2]/10",
    oauthUrl: "#",
  },
  {
    id: "instagram",
    name: "Instagram",
    icon: Instagram,
    color: "text-[#E4405F]",
    bgColor: "bg-[#E4405F]/10",
    oauthUrl: "#",
    showPageName: true,
  },
  {
    id: "twitter",
    name: "Twitter / X",
    icon: Twitter,
    color: "text-foreground",
    bgColor: "bg-muted",
    oauthUrl: "#",
  },
  {
    id: "facebook",
    name: "Facebook",
    icon: Facebook,
    color: "text-[#1877F2]",
    bgColor: "bg-[#1877F2]/10",
    oauthUrl: "#",
    showPageName: true,
  },
];

export function ConnectedAccountsSection({ clientAccountId }: ConnectedAccountsSectionProps) {
  const [tokens, setTokens] = useState<OAuthToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  useEffect(() => {
    fetchTokens();
  }, [clientAccountId]);

  const fetchTokens = async () => {
    try {
      const { data, error } = await supabase
        .from("client_oauth_tokens")
        .select("id, platform, page_id, expires_at, created_at")
        .eq("client_id", clientAccountId);

      if (error) throw error;
      setTokens(data || []);
    } catch (error) {
      console.error("Error fetching oauth tokens:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = (platformId: string) => {
    // Placeholder — will be wired to actual OAuth endpoints later
    toast({
      title: "Coming soon",
      description: `OAuth connection for ${platformId} will be available shortly.`,
    });
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
      toast({
        title: "Account disconnected",
        description: `Your ${platformId} account has been disconnected.`,
      });
    } catch (error) {
      console.error("Error disconnecting:", error);
      toast({
        title: "Error",
        description: "Failed to disconnect account. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDisconnecting(null);
    }
  };

  const getTokenForPlatform = (platformId: string) =>
    tokens.find((t) => t.platform === platformId);

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  if (loading) {
    return (
      <Card className="border-0 bg-muted/30">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 bg-muted/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          Connected Accounts
        </CardTitle>
        <CardDescription>
          Connect your social media accounts to enable automated posting
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {platforms.map((platform) => {
          const token = getTokenForPlatform(platform.id);
          const connected = !!token;
          const expired = connected && isExpired(token.expires_at);
          const Icon = platform.icon;

          return (
            <div
              key={platform.id}
              className={cn(
                "flex items-center justify-between p-4 rounded-xl transition-all",
                connected && !expired ? "bg-primary/5 border border-primary/20" : "bg-muted/50"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", platform.bgColor)}>
                  <Icon className={cn("h-5 w-5", platform.color)} />
                </div>
                <div>
                  <p className="text-sm font-medium">{platform.name}</p>
                  {connected && !expired && (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
                        Connected
                      </Badge>
                      {platform.showPageName && token.page_id && (
                        <span className="text-xs text-muted-foreground">
                          Page: {token.page_id}
                        </span>
                      )}
                    </div>
                  )}
                  {expired && (
                    <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">
                      Expired — reconnect
                    </Badge>
                  )}
                  {!connected && (
                    <p className="text-xs text-muted-foreground">Not connected</p>
                  )}
                </div>
              </div>

              {connected && !expired ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleDisconnect(platform.id)}
                  disabled={disconnecting === platform.id}
                >
                  <Unlink className="h-4 w-4" />
                  {disconnecting === platform.id ? "Disconnecting..." : "Disconnect"}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-lg"
                  onClick={() => handleConnect(platform.id)}
                >
                  <Link2 className="h-4 w-4" />
                  Connect
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
