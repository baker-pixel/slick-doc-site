import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    click?: {
      link: string;
      timestamp: string;
      user_agent: string;
      ip_address: string;
    };
    bounce?: {
      message: string;
    };
    complaint?: {
      feedback_type: string;
    };
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: ResendWebhookPayload = await req.json();
    console.log("Received Resend webhook:", JSON.stringify(payload, null, 2));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find the email log by resend_id
    const { data: emailLog, error: findError } = await supabase
      .from("email_logs")
      .select("id")
      .eq("resend_id", payload.data.email_id)
      .single();

    if (findError || !emailLog) {
      console.log("Email log not found for resend_id:", payload.data.email_id);
      return new Response(JSON.stringify({ received: true, matched: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map Resend event types to our event types
    const eventTypeMap: Record<string, string> = {
      "email.sent": "sent",
      "email.delivered": "delivered",
      "email.delivery_delayed": "delayed",
      "email.complained": "complained",
      "email.bounced": "bounced",
      "email.opened": "open",
      "email.clicked": "click",
    };

    const eventType = eventTypeMap[payload.type];
    if (!eventType) {
      console.log("Unknown event type:", payload.type);
      return new Response(JSON.stringify({ received: true, unknown_type: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build metadata based on event type
    let metadata: Record<string, any> = {
      source: "resend_webhook",
      original_type: payload.type,
      created_at: payload.created_at,
    };

    let linkUrl: string | null = null;
    let ipAddress: string | null = null;
    let userAgent: string | null = null;

    if (payload.data.click) {
      linkUrl = payload.data.click.link;
      ipAddress = payload.data.click.ip_address;
      userAgent = payload.data.click.user_agent;
    }

    if (payload.data.bounce) {
      metadata.bounce_message = payload.data.bounce.message;
    }

    if (payload.data.complaint) {
      metadata.feedback_type = payload.data.complaint.feedback_type;
    }

    // Record the tracking event
    const { error: insertError } = await supabase
      .from("email_tracking_events")
      .insert({
        email_log_id: emailLog.id,
        event_type: eventType,
        ip_address: ipAddress,
        user_agent: userAgent,
        link_url: linkUrl,
        metadata,
      });

    if (insertError) {
      console.error("Error recording webhook event:", insertError);
    } else {
      console.log("Recorded webhook event:", eventType, "for email:", emailLog.id);
    }

    // Update email_logs status for certain events
    if (["delivered", "bounced", "complained"].includes(eventType)) {
      await supabase
        .from("email_logs")
        .update({ status: eventType })
        .eq("id", emailLog.id);
    }

    return new Response(JSON.stringify({ received: true, recorded: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in resend-webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
