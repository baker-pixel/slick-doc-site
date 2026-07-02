import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "loading" | "success" | "no_page" | "error";

const PLATFORM_NAMES: Record<string, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  twitter: "X (Twitter)",
};

const PAGE_REQUIRED_PLATFORMS = new Set(["facebook", "instagram"]);

export default function SocialCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [platformName, setPlatformName] = useState("Account");
  const [provider, setProvider] = useState("");

  useEffect(() => {
    const isSuccess = searchParams.get("isSuccess") === "true";
    const providerParam = searchParams.get("provider") || "";
    const error = searchParams.get("error") || "";
    const accountIds = searchParams.get("accountIds") || "";

    const displayName = PLATFORM_NAMES[providerParam.toLowerCase()] || providerParam || "Account";
    setPlatformName(displayName);
    setProvider(providerParam.toLowerCase());

    if (!isSuccess) {
      setStatus("error");
      setMessage(error || "Connection was cancelled or failed. Please try again.");
      return;
    }

    // PfM returns isSuccess=true but empty accountIds when the user completed
    // Meta OAuth without selecting / granting access to a Facebook Page or Instagram account.
    if (!accountIds && PAGE_REQUIRED_PLATFORMS.has(providerParam.toLowerCase())) {
      setStatus("no_page");
      return;
    }

    const doSync = async () => {
      try {
        const storedClientId = localStorage.getItem("pfm_oauth_client_id");
        localStorage.removeItem("pfm_oauth_client_id");

        let clientId = storedClientId;

        if (!clientId) {
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
            body: {
              clientId,
              accountIds: accountIds ? accountIds.split(",").filter(Boolean) : undefined,
            },
          });
        }

        setStatus("success");
        setMessage(`${displayName} connected successfully!`);
        setTimeout(() => window.close(), 2000);
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

        {status === "no_page" && (
          <>
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
            <div className="space-y-3">
              <p className="text-lg font-semibold">No {platformName} Page Selected</p>
              {provider === "facebook" ? (
                <div className="text-sm text-muted-foreground space-y-2 text-left bg-muted/50 rounded-lg p-4">
                  <p className="font-medium text-foreground">To connect Facebook you need to:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Have a <strong>Facebook Business Page</strong> (not a personal profile)</li>
                    <li>During Meta OAuth, when asked about Pages — <strong>select your page</strong></li>
                    <li>Grant <strong>all requested permissions</strong> (don't uncheck anything)</li>
                  </ol>
                  <p className="text-xs mt-2">Personal Facebook profiles cannot be connected — only Business Pages.</p>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground space-y-2 text-left bg-muted/50 rounded-lg p-4">
                  <p className="font-medium text-foreground">To connect Instagram you need to:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Have an <strong>Instagram Business or Creator account</strong></li>
                    <li>Connect it to a <strong>Facebook Page</strong></li>
                    <li>Grant all requested permissions during the OAuth flow</li>
                  </ol>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => window.close()} className="gap-2">
                Close &amp; Try Again
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate("/portal")} className="gap-2">
                <ExternalLink className="h-3.5 w-3.5" />
                Return to Portal
              </Button>
            </div>
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
