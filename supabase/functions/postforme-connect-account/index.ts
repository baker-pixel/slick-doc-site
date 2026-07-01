import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PFM_API = "https://api.postforme.dev";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const pfmApiKey = Deno.env.get("POSTFORME_API_KEY");

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    if (!pfmApiKey) {
      return json({ error: "POSTFORME_API_KEY not configured" }, 500);
    }

    const { clientId, platform, permissions, redirectUrl } = await req.json();

    if (!clientId || !platform) {
      return json({ error: "clientId and platform are required" }, 400);
    }

    // Verify client exists
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: client, error: clientErr } = await supabase
      .from("client_accounts")
      .select("id, business_name")
      .eq("id", clientId)
      .single();

    if (clientErr || !client) {
      return json({ error: "Client not found" }, 404);
    }

    // Call Post for Me to generate auth URL
    const pfmRes = await fetch(`${PFM_API}/v1/social-accounts/auth-url`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pfmApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platform,
        external_id: clientId,
        permissions: permissions ?? ["posts", "feeds"],
        ...(redirectUrl ? { redirect_url: redirectUrl } : {}),
      }),
    });

    if (!pfmRes.ok) {
      const text = await pfmRes.text();
      console.error("PfM auth-url error:", pfmRes.status, text);
      return json({ error: `Post for Me API error ${pfmRes.status}: ${text}` }, 502);
    }

    const pfmData = await pfmRes.json();

    return json({ url: pfmData.url, platform: pfmData.platform });
  } catch (err: unknown) {
    console.error("postforme-connect-account error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
