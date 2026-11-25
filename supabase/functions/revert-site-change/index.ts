// Undo a change the site agent applied. The site puts the field back the way it was
// before our FIRST change to it (it remembers that itself), so undoing any one of
// several stacked changes to the same field restores the true original.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkClientOrAdminAuth } from "../_shared/core/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const REVERTIBLE = ["applied", "verified", "unverified"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();
    const changeId = body.change_id as string;
    if (!changeId) return json({ error: "change_id required" }, 400);

    const { data: change } = await supabase.from("site_changes").select("*").eq("id", changeId).maybeSingle();
    if (!change) return json({ error: "Change not found" }, 404);

    const { data: site } = await supabase
      .from("connected_sites").select("client_id, agent_mode, status").eq("id", change.site_id).maybeSingle();
    if (!site) return json({ error: "Site not found" }, 404);

    const auth = await checkClientOrAdminAuth(req, supabase, site.client_id, body.password as string | undefined);
    if (!auth.authorized) return json({ error: "Unauthorized" }, 403);

    if (site.agent_mode !== "agent") return json({ error: "Only sites on the new connection can undo changes." }, 409);
    if (site.status === "disconnected") return json({ error: "This site is disconnected." }, 409);
    if (!REVERTIBLE.includes(change.status)) {
      return json({ error: change.status === "revert_queued" || change.status === "revert_delivered"
        ? "Already being undone." : "This change is not live, so there is nothing to undo." }, 409);
    }

    // Every other live change to the same field on the same page is undone by the same revert.
    let q = supabase.from("site_changes").select("id").eq("site_id", change.site_id).eq("field", change.field)
      .in("status", REVERTIBLE).neq("id", change.id);
    q = change.post_id ? q.eq("post_id", change.post_id)
      : change.media_id ? q.eq("media_id", change.media_id)
      : change.page_url ? q.eq("page_url", change.page_url)
      : change.image_src ? q.eq("image_src", change.image_src) : q;
    const { data: siblings } = await q;

    const now = new Date().toISOString();
    if (siblings?.length) {
      await supabase.from("site_changes")
        .update({ status: "reverted", reverted_at: now, updated_at: now })
        .in("id", siblings.map((s: { id: string }) => s.id));
    }
    await supabase.from("site_changes").update({ status: "revert_queued", error_message: null, updated_at: now }).eq("id", change.id);

    return json({ success: true, queued: true });
  } catch (e) {
    console.error("revert-site-change error:", e instanceof Error ? e.message : e);
    return json({ error: "Could not undo this change" }, 500);
  }
});
