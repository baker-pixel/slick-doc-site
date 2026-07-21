import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { markProspectEngagement } from "../_shared/prospectEngagement.ts";

// 1x1 transparent GIF
const TRACKING_PIXEL = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00,
  0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21,
  0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
  0x01, 0x00, 0x3b
]);

const handler = async (req: Request): Promise<Response> => {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const url = new URL(req.url);
    const trackingId = url.searchParams.get("tid");

    if (!trackingId) {
      console.log("No tracking ID provided");
      return new Response(TRACKING_PIXEL, {
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      });
    }

    // Find the email log by tracking_id
    const { data: emailLog, error: findError } = await supabase
      .from("email_logs")
      .select("id")
      .eq("tracking_id", trackingId)
      .single();

    if (findError || !emailLog) {
      console.log("Email log not found for tracking ID:", trackingId);
      return new Response(TRACKING_PIXEL, {
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    // Get request metadata
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // Check if this is a duplicate open (within 1 minute)
    const { data: existingOpen } = await supabase
      .from("email_tracking_events")
      .select("id")
      .eq("email_log_id", emailLog.id)
      .eq("event_type", "open")
      .gte("created_at", new Date(Date.now() - 60000).toISOString())
      .limit(1);

    if (!existingOpen || existingOpen.length === 0) {
      // Record the open event
      const { error: insertError } = await supabase
        .from("email_tracking_events")
        .insert({
          email_log_id: emailLog.id,
          event_type: "open",
          ip_address: ipAddress,
          user_agent: userAgent,
          metadata: { source: "tracking_pixel" },
        });

      if (insertError) {
        console.error("Error recording open event:", insertError);
      } else {
        console.log("Recorded open event for email:", emailLog.id);
        await markProspectEngagement(supabase, emailLog.id, "open");
      }
    } else {
      console.log("Duplicate open detected, skipping");
    }

    return new Response(TRACKING_PIXEL, {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("Error in track-open:", error);
    return new Response(TRACKING_PIXEL, {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  }
};

serve(handler);
