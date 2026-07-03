import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PFM_API = "https://api.postforme.dev";

// PfM's platform enum uses "x" for Twitter/X; our app uses "twitter" internally.
const FROM_PFM_PLATFORM: Record<string, string> = { x: "twitter" };

interface PfmAccount {
  id: string;
  platform: string;
  username: string | null;
  profile_photo_url: string | null;
  status: string;
  external_id: string | null;
}

async function pfmGet(path: string, apiKey: string): Promise<Response> {
  return fetch(`${PFM_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });
}

// Fetch all PfM social accounts (paginated), optionally filtered by external_id
async function fetchAllAccounts(apiKey: string, externalId?: string): Promise<PfmAccount[]> {
  const all: PfmAccount[] = [];
  const limit = 50;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (externalId) params.set("external_id", externalId);

    const res = await pfmGet(`/v1/social-accounts?${params}`, apiKey);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PfM API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const accounts: PfmAccount[] = data.data ?? [];
    all.push(...accounts);

    hasMore = !!data.meta?.next && accounts.length >= limit;
    offset += limit;
  }

  return all;
}

// Fetch a single account by its PfM spc_xxx ID
async function fetchAccountById(apiKey: string, accountId: string): Promise<PfmAccount | null> {
  const res = await pfmGet(`/v1/social-accounts/${accountId}`, apiKey);
  if (!res.ok) {
    console.warn(`Could not fetch PfM account ${accountId}: ${res.status}`);
    return null;
  }
  const data = await res.json();
  // PfM may return { data: {...} } or the object directly
  return data.data ?? data ?? null;
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
    if (!pfmApiKey) return json({ error: "POSTFORME_API_KEY not configured" }, 500);

    const body = await req.json();
    const clientId: string | undefined = body.clientId;
    // accountIds = specific PfM spc_xxx IDs from the OAuth callback URL
    const accountIds: string[] | undefined = body.accountIds;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Two auth paths: admin panel (ADMIN_PASSWORD) or portal user / admin-role JWT
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    const isAdminCall = !!adminPassword && body.password === adminPassword;

    if (!isAdminCall) {
      const authHeader = req.headers.get("authorization");
      if (!authHeader) return json({ error: "Unauthorized" }, 401);

      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "Unauthorized" }, 401);

      // Caller must be a portal user of this client, or an admin
      if (clientId) {
        const { data: portalUser } = await supabase
          .from("client_portal_users")
          .select("id")
          .eq("user_id", user.id)
          .eq("client_account_id", clientId)
          .maybeSingle();
        if (!portalUser) {
          const { data: isAdmin } = await supabase.rpc("has_role", { _role: "admin", _user_id: user.id });
          if (isAdmin !== true) return json({ error: "Forbidden" }, 403);
        }
      }
    }

    let resolvedAccounts: PfmAccount[] = [];

    if (accountIds && accountIds.length > 0) {
      // Fast path: fetch only the accounts that were just connected.
      // This is reliable regardless of whether PfM supports external_id filtering.
      console.log(`Fetching ${accountIds.length} specific PfM accounts: ${accountIds.join(", ")}`);
      const fetched = await Promise.all(accountIds.map((id) => fetchAccountById(pfmApiKey, id)));
      resolvedAccounts = fetched.filter((a): a is PfmAccount => a !== null);
    }

    if (resolvedAccounts.length === 0) {
      // Fallback 1: filter by external_id (clientId) on PfM's side
      if (clientId) {
        console.log(`Fetching PfM accounts with external_id=${clientId}`);
        resolvedAccounts = await fetchAllAccounts(pfmApiKey, clientId);
      }

      // Fallback 2: if still nothing, pull ALL accounts and filter in JS by external_id
      // (handles PfM not supporting the external_id query param)
      if (resolvedAccounts.length === 0 && clientId) {
        console.log("external_id filter returned 0 — fetching all accounts and filtering locally");
        const allAccounts = await fetchAllAccounts(pfmApiKey);
        resolvedAccounts = allAccounts.filter((a) => a.external_id === clientId);
        console.log(`Local filter found ${resolvedAccounts.length} accounts for clientId=${clientId}`);
      }
    }

    if (resolvedAccounts.length === 0) {
      console.log("No PfM accounts found for this client");
      return json({ synced: 0, accounts: [] });
    }

    const upsertRows = resolvedAccounts
      .map((acc) => {
        const resolvedClientId = clientId ?? acc.external_id;
        if (!resolvedClientId) return null;
        return {
          client_id: resolvedClientId,
          platform: FROM_PFM_PLATFORM[acc.platform] ?? acc.platform,
          postforme_account_id: acc.id,
          username: acc.username ?? null,
          profile_photo_url: acc.profile_photo_url ?? null,
          status: acc.status === "active" ? "connected" : (acc.status ?? "connected"),
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

    console.log(`Synced ${upsertRows.length} PfM accounts for client=${clientId}`);
    return json({ synced: upsertRows.length, accounts: upsertRows });
  } catch (err: unknown) {
    console.error("postforme-sync-accounts error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
