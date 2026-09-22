import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { pollClientMailbox } from "../_shared/clientMailboxPoll.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Every client with a verified SMTP mailbox connected -- unverified ones
    // are skipped inside pollClientMailbox too, but filtering here avoids
    // spinning up an IMAP attempt we already know will be a no-op.
    const { data: rows, error } = await supabase
      .from("client_oauth_tokens")
      .select("client_id, token_metadata")
      .eq("platform", "smtp");

    if (error) throw error;

    const candidates = (rows ?? []).filter(
      (r: { token_metadata: Record<string, unknown> | null }) => r.token_metadata?.verified === true,
    );

    const results = [];
    for (const row of candidates) {
      const result = await pollClientMailbox(supabase, row.client_id);
      results.push({ client_id: row.client_id, ...result });
    }

    const totals = results.reduce(
      (acc, r) => ({ polled: acc.polled + r.polled, bounced: acc.bounced + r.bounced, replied: acc.replied + r.replied }),
      { polled: 0, bounced: 0, replied: 0 },
    );

    console.log(`Polled ${candidates.length} client mailbox(es):`, totals);

    return new Response(JSON.stringify({ mailboxes: candidates.length, ...totals, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("poll-client-mailboxes error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
