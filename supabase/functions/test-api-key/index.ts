import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = req.headers.get("x-api-key");
    const expectedApiKey = Deno.env.get("CAMPAIGN_API_KEY");
    
    if (!apiKey) {
      console.log("Test API key: No API key provided");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Missing API key",
          message: "Please provide x-api-key header" 
        }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (apiKey !== expectedApiKey) {
      console.log("Test API key: Invalid API key provided");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Invalid API key",
          message: "The provided API key does not match" 
        }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Test API key: Valid API key verified");
    return new Response(
      JSON.stringify({
        success: true,
        message: "API key is valid and working correctly",
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in test-api-key function:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
