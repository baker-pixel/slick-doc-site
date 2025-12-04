import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, password, table, id, data } = await req.json();
    
    // Verify admin password
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    if (!password || password !== adminPassword) {
      console.log("Admin auth failed: invalid password");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Admin action: ${action} on table: ${table}`);

    switch (action) {
      case "list": {
        let query = supabase.from(table).select("*");
        
        // For email_logs, also include tracking_id
        if (table === "email_logs") {
          query = supabase.from(table).select("*, tracking_id");
        }
        
        const { data: rows, error } = await query.order("created_at", { ascending: false });
        
        if (error) throw error;
        return new Response(
          JSON.stringify({ data: rows }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "list_tracking_events": {
        const { data: events, error } = await supabase
          .from("email_tracking_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1000);
        
        if (error) throw error;
        return new Response(
          JSON.stringify({ data: events }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_tracking_stats": {
        // Get aggregated tracking statistics
        const { data: events, error } = await supabase
          .from("email_tracking_events")
          .select("event_type, email_log_id, created_at");
        
        if (error) throw error;

        const { data: logs, error: logsError } = await supabase
          .from("email_logs")
          .select("id, status");
        
        if (logsError) throw logsError;

        const totalSent = logs?.filter(l => l.status === "sent" || l.status === "delivered").length || 0;
        const uniqueOpens = new Set(events?.filter(e => e.event_type === "open").map(e => e.email_log_id)).size;
        const uniqueClicks = new Set(events?.filter(e => e.event_type === "click").map(e => e.email_log_id)).size;
        const bounces = events?.filter(e => e.event_type === "bounced").length || 0;
        const delivered = events?.filter(e => e.event_type === "delivered").length || 0;

        return new Response(
          JSON.stringify({
            data: {
              totalSent,
              uniqueOpens,
              uniqueClicks,
              bounces,
              delivered,
              openRate: totalSent > 0 ? ((uniqueOpens / totalSent) * 100).toFixed(1) : "0",
              clickRate: totalSent > 0 ? ((uniqueClicks / totalSent) * 100).toFixed(1) : "0",
              bounceRate: totalSent > 0 ? ((bounces / totalSent) * 100).toFixed(1) : "0",
              deliveryRate: totalSent > 0 ? (((totalSent - bounces) / totalSent) * 100).toFixed(1) : "0",
            }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "update": {
        const { data: updated, error } = await supabase
          .from(table)
          .update(data)
          .eq("id", id)
          .select()
          .single();
        
        if (error) throw error;
        console.log(`Updated ${table} record: ${id}`);
        return new Response(
          JSON.stringify({ data: updated }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete": {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq("id", id);
        
        if (error) throw error;
        console.log(`Deleted ${table} record: ${id}`);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "schedule_email": {
        // Schedule a new email
        const { recipient_email, recipient_name, subject, html_content, scheduled_for, recipient_timezone, optimal_send_time } = data;
        
        if (!recipient_email || !subject || !html_content) {
          return new Response(
            JSON.stringify({ error: "Missing required fields" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: newEmail, error } = await supabase
          .from("email_queue")
          .insert({
            recipient_email,
            recipient_name: recipient_name || null,
            subject,
            html_content,
            scheduled_for: scheduled_for || new Date().toISOString(),
            status: "pending",
            recipient_timezone: recipient_timezone || "America/New_York",
            optimal_send_time: optimal_send_time || false,
            metadata: { scheduled_via: "admin", optimal_send_time: optimal_send_time || false },
          })
          .select()
          .single();

        if (error) throw error;
        console.log(`Scheduled email to ${recipient_email} for ${scheduled_for}`);
        return new Response(
          JSON.stringify({ data: newEmail }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_optimal_times": {
        // Get engagement data by hour to recommend optimal send times
        const { data: events, error } = await supabase
          .from("email_tracking_events")
          .select("event_type, created_at")
          .eq("event_type", "open");

        if (error) throw error;

        const hourCounts: Record<number, number> = {};
        const dayCounts: Record<number, number> = {};

        events?.forEach(event => {
          const date = new Date(event.created_at);
          const hour = date.getHours();
          const day = date.getDay();
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;
          dayCounts[day] = (dayCounts[day] || 0) + 1;
        });

        // Sort by count and get top hours/days
        const topHours = Object.entries(hourCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 4)
          .map(([hour, count]) => ({ hour: parseInt(hour), count }));

        const topDays = Object.entries(dayCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([day, count]) => ({ day: parseInt(day), count }));

        return new Response(
          JSON.stringify({ 
            data: { 
              topHours: topHours.length > 0 ? topHours : [{ hour: 10, count: 0 }, { hour: 14, count: 0 }],
              topDays: topDays.length > 0 ? topDays : [{ day: 2, count: 0 }, { day: 3, count: 0 }],
              hasData: events?.length > 0
            } 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Admin function error:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
