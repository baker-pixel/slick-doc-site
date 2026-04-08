import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

interface CampaignRequest {
  template_slug: string;
  recipients: Array<{
    email: string;
    firstName?: string;
    lastName?: string;
    businessName?: string;
  }>;
  variables?: Record<string, string>;
  scheduled_for?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify API key
    const apiKey = req.headers.get("x-api-key");
    const expectedApiKey = Deno.env.get("CAMPAIGN_API_KEY");
    
    if (!apiKey || apiKey !== expectedApiKey) {
      console.error("Invalid or missing API key");
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid API key" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { template_slug, recipients, variables = {}, scheduled_for }: CampaignRequest = await req.json();

    // Validate required fields
    if (!template_slug) {
      return new Response(
        JSON.stringify({ error: "template_slug is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!recipients || recipients.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one recipient is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Processing campaign for template: ${template_slug}, recipients: ${recipients.length}`);

    // Fetch template
    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("*")
      .eq("slug", template_slug)
      .eq("is_active", true)
      .single();

    if (templateError || !template) {
      console.error("Template not found:", templateError);
      return new Response(
        JSON.stringify({ error: `Template not found: ${template_slug}` }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Process and replace variables
    const replaceVariables = (content: string, recipient: CampaignRequest["recipients"][0]): string => {
      let result = content;
      result = result.replace(/\{\{firstName\}\}/g, recipient.firstName || "there");
      result = result.replace(/\{\{lastName\}\}/g, recipient.lastName || "");
      result = result.replace(/\{\{businessName\}\}/g, recipient.businessName || "your business");
      result = result.replace(/\{\{email\}\}/g, recipient.email);
      
      Object.entries(variables).forEach(([key, value]) => {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
      });
      
      return result;
    };

    // Queue emails for each recipient
    const scheduledTime = scheduled_for ? new Date(scheduled_for) : new Date();
    
    const emailsToQueue = recipients.map(recipient => ({
      recipient_email: recipient.email,
      recipient_name: [recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || null,
      subject: replaceVariables(template.subject, recipient),
      html_content: replaceVariables(template.html_content, recipient),
      scheduled_for: scheduledTime.toISOString(),
      status: scheduled_for ? "scheduled" : "pending",
      metadata: {
        template_id: template.id,
        template_slug: template.slug,
        api_triggered: true,
        campaign_sent_at: new Date().toISOString()
      }
    }));

    const { data: queuedEmails, error: queueError } = await supabase
      .from("email_queue")
      .insert(emailsToQueue)
      .select("id");

    if (queueError) {
      console.error("Error queuing emails:", queueError);
      return new Response(
        JSON.stringify({ error: "Failed to queue emails", details: queueError.message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Successfully queued ${queuedEmails?.length} emails`);

    return new Response(
      JSON.stringify({
        success: true,
        queued: queuedEmails?.length || 0,
        scheduled_for: scheduledTime.toISOString(),
        template: template_slug
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in send-campaign function:", error);

    await supabase.from('automation_alerts').insert({
      alert_type: 'function_error',
      severity: 'error',
      title: `Error in send-campaign`,
      message: error instanceof Error ? error.message : 'Unknown error',
      source: 'send-campaign',
      metadata: {
        function_name: 'send-campaign',
        client_id: null,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    }).catch(console.error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
