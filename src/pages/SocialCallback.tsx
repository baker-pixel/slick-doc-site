import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "loading" | "success" | "error";

const PLATFORM_NAMES: Record<string, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  twitter: "X (Twitter)",
  tiktok: "TikTok",
  youtube: "YouTube",
  bluesky: "Bluesky",
  threads: "Threads",
};

export default function SocialCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [platformName, setPlatformName] = useState("Account");

  useEffect(() => {
    const isSuccess = searchParams.get("isSuccess") === "true";
    const provider = searchParams.get("provider") || "";
    const error = searchParams.get("error") || "";
    // accountIds = comma-separated PfM account IDs (spc_xxx) just connected
    const accountIds = searchParams.get("accountIds") || "";

    const displayName = PLATFORM_NAMES[provider.toLowerCase()] || provider || "Account";
    setPlatformName(displayName);

    if (!isSuccess) {
      setStatus("error");
      setMessage(error || "Connection was cancelled or failed. Please try again.");
      return;
    }

    const doSync = async () => {
      try {
        // Prefer the clientId stored before opening OAuth tab (works for admin + client users)
        const storedClientId = localStorage.getItem("pfm_oauth_client_id");
        localStorage.removeItem("pfm_oauth_client_id");

        let clientId = storedClientId;

        if (!clientId) {
          // Fallback: look up via session
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const { data: portalUser } = await supabase
              .from("client_portal_users")
              .select("client_account_id")
              .eq("user_id", session.user.id)
              .maybeSingle();
            clientId = portalUser?.client_account_id ?? null;
          }
        }

        if (clientId) {
          await supabase.functions.invoke("postforme-sync-accounts", {
            // Pass accountIds so sync can fetch those specific accounts from PfM
            // rather than relying on external_id filter (which PfM may not support)
            body: {
              clientId,
              accountIds: accountIds ? accountIds.split(",").filter(Boolean) : undefined,
            },
          });
        }

        setStatus("success");
        setMessage(`${displayName} connected successfully!`);

        setTimeout(() => {
          window.close();
        }, 2000);
      } catch {
        setStatus("success");
        setMessage(`${displayName} connected! Return to your portal to confirm.`);
        setTimeout(() => window.close(), 2000);
      }
    };

    doSync();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <div className="w-full max-w-sm text-center space-y-6">
        {status === "loading" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <div>
              <p className="text-lg font-semibold">Connecting {platformName}…</p>
              <p className="text-sm text-muted-foreground mt-1">Syncing your account, please wait.</p>
            </div>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <div>
              <p className="text-lg font-semibold">Connected!</p>
              <p className="text-sm text-muted-foreground mt-1">{message}</p>
              <p className="text-xs text-muted-foreground mt-2">This tab will close automatically…</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/portal")} className="gap-2">
              <ExternalLink className="h-3.5 w-3.5" />
              Return to Portal
            </Button>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <div>
              <p className="text-lg font-semibold">Connection Failed</p>
              <p className="text-sm text-muted-foreground mt-1">{message}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/portal")} className="gap-2">
              <ExternalLink className="h-3.5 w-3.5" />
              Return to Portal
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
