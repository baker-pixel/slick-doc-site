import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Returns public OAuth client IDs (NOT secrets) so the frontend can build authorization URLs
  const config: Record<string, { clientId: string; configured: boolean }> = {
    linkedin: {
      clientId: Deno.env.get("LINKEDIN_CLIENT_ID") || "",
      configured: !!(Deno.env.get("LINKEDIN_CLIENT_ID") && Deno.env.get("LINKEDIN_CLIENT_SECRET")),
    },
    facebook: {
      clientId: Deno.env.get("FACEBOOK_APP_ID") || "",
      configured: !!(Deno.env.get("FACEBOOK_APP_ID") && Deno.env.get("FACEBOOK_APP_SECRET")),
    },
    instagram: {
      clientId: Deno.env.get("FACEBOOK_APP_ID") || "",
      configured: !!(Deno.env.get("FACEBOOK_APP_ID") && Deno.env.get("FACEBOOK_APP_SECRET")),
    },
    twitter: {
      clientId: Deno.env.get("TWITTER_CLIENT_ID") || "",
      configured: !!(Deno.env.get("TWITTER_CLIENT_ID") && Deno.env.get("TWITTER_CLIENT_SECRET")),
    },
  };

  return new Response(JSON.stringify(config), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
