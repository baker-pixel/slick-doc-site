import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: "deliverable" | "invoice" | "analytics" | "agreement_signed";
  client_account_id: string;
  title: string;
  description?: string;
  details?: Record<string, string | number>;
  admin_email?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { type, client_account_id, title, description, details, admin_email }: NotificationRequest = await req.json();

    console.log(`Sending ${type} notification for client: ${client_account_id}`);

    // Get client account info
    const { data: clientAccount, error: clientError } = await supabase
      .from("client_accounts")
      .select("email, business_name, first_name")
      .eq("id", client_account_id)
      .single();

    if (clientError || !clientAccount) {
      console.error("Client not found:", clientError);
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const clientName = clientAccount.first_name || clientAccount.business_name;
    const portalUrl = `${Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", "")}/client-portal`;

    let subject = "";
    let htmlContent = "";

    switch (type) {
      case "deliverable":
        subject = `New Deliverable Ready: ${title}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a1a1a;">New Deliverable Available</h1>
            <p>Hi ${clientName},</p>
            <p>A new deliverable is ready for your review:</p>
            <div style="background: #f4f4f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h2 style="margin: 0 0 10px 0; color: #1a1a1a;">${title}</h2>
              ${description ? `<p style="color: #666; margin: 0;">${description}</p>` : ""}
              ${details?.category ? `<p style="color: #888; margin: 10px 0 0 0; font-size: 14px;">Category: ${details.category}</p>` : ""}
            </div>
            <p>Please log in to your client portal to review and provide feedback.</p>
            <a href="${portalUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">View Deliverable</a>
            <p style="color: #888; margin-top: 30px; font-size: 12px;">This is an automated message from your marketing team.</p>
          </div>
        `;
        break;

      case "invoice":
        subject = `New Invoice: ${title}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a1a1a;">New Invoice</h1>
            <p>Hi ${clientName},</p>
            <p>A new invoice has been generated for your account:</p>
            <div style="background: #f4f4f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h2 style="margin: 0 0 10px 0; color: #1a1a1a;">Invoice #${title}</h2>
              ${details?.amount ? `<p style="font-size: 24px; font-weight: bold; color: #1a1a1a; margin: 10px 0;">${details.currency || "USD"} ${details.amount}</p>` : ""}
              ${details?.due_date ? `<p style="color: #666; margin: 0;">Due: ${details.due_date}</p>` : ""}
              ${description ? `<p style="color: #666; margin: 10px 0 0 0;">${description}</p>` : ""}
            </div>
            <p>Please log in to your client portal to view the full invoice details.</p>
            <a href="${portalUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">View Invoice</a>
            <p style="color: #888; margin-top: 30px; font-size: 12px;">This is an automated message from your marketing team.</p>
          </div>
        `;
        break;

      case "analytics":
        subject = `New Analytics Report: ${title}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a1a1a;">New Analytics Report</h1>
            <p>Hi ${clientName},</p>
            <p>A new performance analytics report is available for your review:</p>
            <div style="background: #f4f4f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h2 style="margin: 0 0 10px 0; color: #1a1a1a;">${title}</h2>
              ${details?.period ? `<p style="color: #666; margin: 0;">Report Period: ${details.period}</p>` : ""}
              ${details?.website_visits ? `<p style="color: #666; margin: 5px 0;">Website Visits: ${details.website_visits}</p>` : ""}
              ${details?.leads_generated ? `<p style="color: #666; margin: 5px 0;">Leads Generated: ${details.leads_generated}</p>` : ""}
              ${details?.conversions ? `<p style="color: #666; margin: 5px 0;">Conversions: ${details.conversions}</p>` : ""}
            </div>
            <p>View the complete report with detailed insights in your client portal.</p>
            <a href="${portalUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">View Report</a>
            <p style="color: #888; margin-top: 30px; font-size: 12px;">This is an automated message from your marketing team.</p>
          </div>
        `;
        break;

      case "agreement_signed":
        subject = `Agreement Signed: ${title}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a1a1a;">Agreement Signed</h1>
            <p>A client has signed an agreement:</p>
            <div style="background: #f4f4f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h2 style="margin: 0 0 10px 0; color: #1a1a1a;">${title}</h2>
              <p style="color: #666; margin: 5px 0;"><strong>Client:</strong> ${clientName} (${clientAccount.business_name})</p>
              ${details?.signer_name ? `<p style="color: #666; margin: 5px 0;"><strong>Signed by:</strong> ${details.signer_name}</p>` : ""}
              ${details?.signed_at ? `<p style="color: #666; margin: 5px 0;"><strong>Signed at:</strong> ${details.signed_at}</p>` : ""}
            </div>
            <p>You can view the signed agreement in the admin panel.</p>
            <p style="color: #888; margin-top: 30px; font-size: 12px;">This is an automated notification from the Client Portal.</p>
          </div>
        `;
        break;

      default:
        return new Response(
          JSON.stringify({ error: "Invalid notification type" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
    }

    // For agreement_signed, send to admin; otherwise send to client
    const recipientEmail = type === "agreement_signed" && admin_email 
      ? admin_email 
      : clientAccount.email;

    const emailResponse = await resend.emails.send({
      from: "Client Portal <onboarding@resend.dev>",
      to: [recipientEmail],
      subject,
      html: htmlContent,
    });

    console.log("Email sent successfully:", emailResponse);

    // Log the email
    await supabase.from("email_logs").insert({
      recipient_email: clientAccount.email,
      subject,
      status: "sent",
      metadata: { type, client_account_id, title },
    });

    return new Response(
      JSON.stringify({ success: true, emailResponse }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
