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

// Svix signature check (Resend signs webhooks via Svix). Enforced only when
// RESEND_WEBHOOK_SECRET is configured; without it, events are accepted
// unsigned as before (matching prior behavior, but alert-worthy for prod).
async function verifySvixSignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) {
    console.warn("RESEND_WEBHOOK_SECRET not set — accepting webhook unsigned");
    return true;
  }
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Reject stale timestamps (replay protection, 5 min window).
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const secretBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${svixId}.${svixTimestamp}.${rawBody}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(signed)));
  // Header holds space-separated "v1,<base64sig>" entries.
  return svixSignature.split(" ").some((part) => part.split(",")[1] === expected);
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const rawBody = await req.text();
    if (!(await verifySvixSignature(req, rawBody))) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const payload: ResendWebhookPayload = JSON.parse(rawBody);
    console.log("Received Resend webhook:", JSON.stringify(payload, null, 2));

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

    // Global suppression: a hard bounce or spam complaint opts the address
    // out everywhere. email_preferences is the suppression source of truth —
    // both the prospect drip and the email queue check it before sending.
    if (["bounced", "complained"].includes(eventType)) {
      const recipient = payload.data.to?.[0]?.toLowerCase();
      if (recipient) {
        const { error: suppressErr } = await supabase
          .from("email_preferences")
          .upsert({
            email: recipient,
            subscribed: false,
            unsubscribed_at: new Date().toISOString(),
            preferences: { marketing: false, transactional: true, sequences: false },
          }, { onConflict: "email" });
        if (suppressErr) console.error("Failed to suppress", recipient, suppressErr);
        else console.log(`Suppressed ${recipient} after ${eventType}`);
      }
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
