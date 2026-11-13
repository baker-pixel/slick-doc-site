import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const ClientPortal = lazy(() => import("@/pages/ClientPortal"));

// Admin-only: shows a client's portal read-only under the admin's own Supabase
// session. Access is decided by the database (the session must carry the admin
// role), not by this page, so a non-admin who opens this URL sees nothing: the
// row-level policies return no data. This gate just gives a clear message and
// records who looked.
export default function ViewAsClient() {
  const { clientId } = useParams<{ clientId: string }>();
  const [state, setState] = useState<"checking" | "denied" | "no-portal" | "ok">("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !clientId) return !cancelled && setState("denied");

      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" });
      if (!isAdmin) return !cancelled && setState("denied");

      // A client who hasn't accepted their invitation has no portal account, so
      // there is nothing to look at: say so instead of showing an empty portal.
      const { data: portalUsers } = await supabase.from("client_portal_users")
        .select("id").eq("client_account_id", clientId).limit(1);
      if (!portalUsers || portalUsers.length === 0) return !cancelled && setState("no-portal");

      // Audit trail, best effort (runs before the read-only guard switches on).
      // Typed loosely: the table isn't in the generated types until they're regenerated.
      await (supabase as any).from("admin_portal_views")
        .insert({ admin_user_id: session.user.id, client_account_id: clientId })
        .then(({ error }: { error: { message: string } | null }) => {
          if (error) console.warn("view-as audit log failed:", error.message);
        });

      if (!cancelled) setState("ok");
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (state === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (state === "no-portal") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center space-y-4">
          <ShieldAlert className="w-10 h-10 mx-auto text-muted-foreground" />
          <h1 className="text-lg font-semibold">No portal access yet</h1>
          <p className="text-sm text-muted-foreground">
            This client hasn't accepted their portal invitation, so they don't have a portal to view yet. Once they sign up, it will open here.
          </p>
          <Button asChild><Link to="/admin">Back to admin</Link></Button>
        </div>
      </div>
    );
  }

  if (state === "denied" || !clientId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center space-y-4">
          <ShieldAlert className="w-10 h-10 mx-auto text-muted-foreground" />
          <h1 className="text-lg font-semibold">Admin sign-in required</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to the admin dashboard first, then open the client's portal view from their page.
          </p>
          <Button asChild><Link to="/admin">Go to admin</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
      <ClientPortal viewAsClientId={clientId} />
    </Suspense>
  );
}
