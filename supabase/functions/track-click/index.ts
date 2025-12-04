import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const handler = async (req: Request): Promise<Response> => {
  try {
    const url = new URL(req.url);
    const trackingId = url.searchParams.get("tid");
    const redirectUrl = url.searchParams.get("url");

    if (!redirectUrl) {
      console.log("No redirect URL provided");
      return new Response("Missing redirect URL", { status: 400 });
    }

    const decodedUrl = decodeURIComponent(redirectUrl);

    if (!trackingId) {
      console.log("No tracking ID, redirecting directly");
      return Response.redirect(decodedUrl, 302);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find the email log by tracking_id
    const { data: emailLog, error: findError } = await supabase
      .from("email_logs")
      .select("id")
      .eq("tracking_id", trackingId)
      .single();

    if (!findError && emailLog) {
      // Get request metadata
      const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
      const userAgent = req.headers.get("user-agent") || "unknown";

      // Record the click event
      const { error: insertError } = await supabase
        .from("email_tracking_events")
        .insert({
          email_log_id: emailLog.id,
          event_type: "click",
          ip_address: ipAddress,
          user_agent: userAgent,
          link_url: decodedUrl,
          metadata: { source: "tracked_link" },
        });

      if (insertError) {
        console.error("Error recording click event:", insertError);
      } else {
        console.log("Recorded click event for email:", emailLog.id, "URL:", decodedUrl);
      }
    } else {
      console.log("Email log not found for tracking ID:", trackingId);
    }

    return Response.redirect(decodedUrl, 302);
  } catch (error) {
    console.error("Error in track-click:", error);
    // Try to redirect anyway
    const url = new URL(req.url);
    const redirectUrl = url.searchParams.get("url");
    if (redirectUrl) {
      return Response.redirect(decodeURIComponent(redirectUrl), 302);
    }
    return new Response("Error processing click", { status: 500 });
  }
};

serve(handler);
