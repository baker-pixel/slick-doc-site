import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Days of inactivity before triggering the inactive_lead sequence
const INACTIVITY_THRESHOLD_DAYS = 14;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting inactive lead detection...");

    // Get the threshold date
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - INACTIVITY_THRESHOLD_DAYS);

    // Find leads that:
    // 1. Have last_activity_at older than threshold
    // 2. Are not already customers (pipeline stage != Customer)
    // 3. Haven't already received the inactive_lead sequence recently
    const { data: inactiveLeads, error: fetchError } = await supabase
      .from("contact_submissions")
      .select(`
        id,
        email,
        first_name,
        last_name,
        business_name,
        last_activity_at,
        pipeline_stage_id,
        pipeline_stages!inner(name)
      `)
      .lt("last_activity_at", thresholdDate.toISOString())
      .neq("pipeline_stages.name", "Customer")
      .neq("status", "converted");

    if (fetchError) {
      console.error("Error fetching inactive leads:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${inactiveLeads?.length || 0} inactive leads`);

    if (!inactiveLeads || inactiveLeads.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No inactive leads found",
          processed: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check which leads have already received the inactive_lead sequence
    const { data: recentEmails, error: emailError } = await supabase
      .from("email_queue")
      .select("recipient_email, created_at")
      .in("recipient_email", inactiveLeads.map(l => l.email))
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
      .ilike("metadata->>triggerType", "inactive_lead");

    const recentlyEmailedSet = new Set(recentEmails?.map(e => e.recipient_email) || []);

    // Filter out leads that were already emailed
    const leadsToProcess = inactiveLeads.filter(lead => !recentlyEmailedSet.has(lead.email));

    console.log(`${leadsToProcess.length} leads to process (excluding recently emailed)`);

    let successCount = 0;
    const errors: string[] = [];

    // Queue the inactive_lead sequence for each lead
    for (const lead of leadsToProcess) {
      try {
        const { error: invokeError } = await supabase.functions.invoke("queue-sequence-emails", {
          body: {
            triggerType: "inactive_lead",
            recipientEmail: lead.email,
            recipientName: `${lead.first_name} ${lead.last_name}`.trim() || "there",
            businessName: lead.business_name,
          },
        });

        if (invokeError) {
          console.error(`Error queueing sequence for ${lead.email}:`, invokeError);
          errors.push(`${lead.email}: ${invokeError.message}`);
        } else {
          successCount++;
          console.log(`Queued inactive_lead sequence for ${lead.email}`);
        }
      } catch (err: any) {
        console.error(`Exception for ${lead.email}:`, err);
        errors.push(`${lead.email}: ${err.message}`);
      }
    }

    // Log the run
    await supabase.from("automation_alerts").insert({
      alert_type: "inactive_lead_detection",
      severity: "info",
      title: "Inactive Lead Detection Complete",
      message: `Processed ${successCount} inactive leads. ${errors.length} errors.`,
      metadata: {
        total_inactive: inactiveLeads.length,
        already_emailed: inactiveLeads.length - leadsToProcess.length,
        processed: successCount,
        errors: errors.slice(0, 10), // Limit stored errors
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Queued ${successCount} inactive lead sequences`,
        total_inactive: inactiveLeads.length,
        already_emailed: inactiveLeads.length - leadsToProcess.length,
        processed: successCount,
        errors: errors.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in detect-inactive-leads:", error);

    await supabase.from('automation_alerts').insert({
      alert_type: 'function_error',
      severity: 'error',
      title: `Error in detect-inactive-leads`,
      message: error instanceof Error ? error.message : 'Unknown error',
      source: 'detect-inactive-leads',
      metadata: {
        function_name: 'detect-inactive-leads',
        client_id: null,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    }).catch(console.error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
