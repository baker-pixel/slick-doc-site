import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { markProspectEngagement } from "../_shared/prospectEngagement.ts";

// This endpoint only forwards *verified* tracked clicks. Previously it would
// redirect to any `url=` param outright when `tid` was missing, and even
// with a `tid` that didn't resolve to a real email_log -- making this an
// unauthenticated open redirect anyone could use to phish through a
// trusted domain. Now: no tid, no resolving email_log, or a non-http(s)
// scheme all refuse the redirect instead of following it.
const handler = async (req: Request): Promise<Response> => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const url = new URL(req.url);
  const trackingId = url.searchParams.get("tid");
  const redirectUrl = url.searchParams.get("url");

  if (!redirectUrl) return new Response("Missing redirect URL", { status: 400 });

  let decodedUrl: string;
  let parsed: URL;
  try {
    decodedUrl = decodeURIComponent(redirectUrl);
    parsed = new URL(decodedUrl);
  } catch {
    return new Response("Invalid redirect URL", { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return new Response("Invalid redirect URL", { status: 400 });
  }

  if (!trackingId) {
    console.log("No tracking ID -- refusing to redirect");
    return new Response("Missing tracking ID", { status: 400 });
  }

  try {
    const { data: emailLog, error: findError } = await supabase
      .from("email_logs")
      .select("id")
      .eq("tracking_id", trackingId)
      .single();

    if (findError || !emailLog) {
      console.log("Unknown tracking ID -- refusing to redirect:", trackingId);
      return new Response("Unknown tracking ID", { status: 400 });
    }

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

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
      await markProspectEngagement(supabase, emailLog.id, "click");
    }

    return Response.redirect(decodedUrl, 302);
  } catch (error) {
    console.error("Error in track-click:", error);
    return new Response("Error processing click", { status: 500 });
  }
};

serve(handler);
