import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PFM_API = "https://api.postforme.dev";

interface PfmAccount {
  id: string;
  platform: string;
  username: string | null;
  profile_photo_url: string | null;
  status: string;
  external_id: string | null;
}

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

    const { clientId } = await req.json();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all PfM accounts for this clientId (or all if no clientId)
    const allAccounts: PfmAccount[] = [];
    const limit = 50;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (clientId) {
        params.set("external_id", clientId);
      }

      const pfmRes = await fetch(`${PFM_API}/v1/social-accounts?${params}`, {
        headers: {
          Authorization: `Bearer ${pfmApiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!pfmRes.ok) {
        const text = await pfmRes.text();
        return json({ error: `Post for Me API error ${pfmRes.status}: ${text}` }, 502);
      }

      const pfmData = await pfmRes.json();
      const accounts: PfmAccount[] = pfmData.data ?? [];
      allAccounts.push(...accounts);

      hasMore = !!pfmData.meta?.next && accounts.length >= limit;
      offset += limit;
    }

    if (allAccounts.length === 0) {
      return json({ synced: 0, accounts: [] });
    }

    // Determine which client_id to use for each account
    // If clientId was provided, all accounts belong to that client.
    // Otherwise, use external_id on each account (which we set = clientId on connect).
    const upsertRows = allAccounts
      .map((acc) => {
        const resolvedClientId = clientId ?? acc.external_id;
        if (!resolvedClientId) return null;
        return {
          client_id: resolvedClientId,
          platform: acc.platform,
          postforme_account_id: acc.id,
          username: acc.username ?? null,
          profile_photo_url: acc.profile_photo_url ?? null,
          status: acc.status ?? "connected",
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    if (upsertRows.length === 0) {
      return json({ synced: 0, accounts: [] });
    }

    const { error: upsertErr } = await supabase
      .from("client_postforme_accounts")
      .upsert(upsertRows, {
        onConflict: "client_id,postforme_account_id",
        ignoreDuplicates: false,
      });

    if (upsertErr) {
      console.error("Upsert error:", upsertErr);
      return json({ error: upsertErr.message }, 500);
    }

    console.log(`Synced ${upsertRows.length} PfM accounts`);

    return json({ synced: upsertRows.length, accounts: upsertRows });
  } catch (err: unknown) {
    console.error("postforme-sync-accounts error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
