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
        
        // Handle different timestamp columns per table
        let orderColumn = "created_at";
        if (table === "email_logs") {
          query = supabase.from(table).select("*, tracking_id");
          orderColumn = "sent_at";
        } else if (table === "email_cleanup_log") {
          orderColumn = "cleaned_at";
        }
        
        const { data: rows, error } = await query.order(orderColumn, { ascending: false });
        
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

      case "get_list_health": {
        // Get overall list health stats
        const { data: logs } = await supabase
          .from("email_logs")
          .select("id, recipient_email, status");

        const { data: events } = await supabase
          .from("email_tracking_events")
          .select("event_type, email_log_id, created_at");

        const { data: cleanupLogs } = await supabase
          .from("email_cleanup_log")
          .select("id");

        const uniqueEmails = new Set(logs?.map(l => l.recipient_email) || []);
        const bouncedEmails = new Set(
          events?.filter(e => e.event_type === "bounced").map(e => {
            const log = logs?.find(l => l.id === e.email_log_id);
            return log?.recipient_email;
          }).filter(Boolean) || []
        );
        const complainedEmails = new Set(
          events?.filter(e => e.event_type === "complained").map(e => {
            const log = logs?.find(l => l.id === e.email_log_id);
            return log?.recipient_email;
          }).filter(Boolean) || []
        );

        // Find inactive emails (no opens in last 90 days)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        
        const activeEmails = new Set(
          events?.filter(e => 
            e.event_type === "open" && 
            new Date(e.created_at) > ninetyDaysAgo
          ).map(e => {
            const log = logs?.find(l => l.id === e.email_log_id);
            return log?.recipient_email;
          }).filter(Boolean) || []
        );

        const inactiveCount = uniqueEmails.size - activeEmails.size - bouncedEmails.size - complainedEmails.size;

        return new Response(
          JSON.stringify({
            data: {
              totalEmails: uniqueEmails.size,
              bouncedEmails: bouncedEmails.size,
              complainedEmails: complainedEmails.size,
              inactiveEmails: Math.max(0, inactiveCount),
              cleanedTotal: cleanupLogs?.length || 0,
            }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "scan_cleanup_candidates": {
        const { inactiveDays = 90 } = data || {};
        const candidates: Array<{ email: string; reason: string; bounceCount?: number; complaintCount?: number; lastActivity?: string }> = [];

        // Get all logs with their emails
        const { data: logs } = await supabase
          .from("email_logs")
          .select("id, recipient_email, sent_at");

        const { data: events } = await supabase
          .from("email_tracking_events")
          .select("event_type, email_log_id, created_at");

        const { data: existingCleanup } = await supabase
          .from("email_cleanup_log")
          .select("email");

        const cleanedEmails = new Set(existingCleanup?.map(c => c.email) || []);

        // Build email activity map
        const emailActivity: Record<string, { 
          bounces: number; 
          complaints: number; 
          lastOpen?: string;
          lastSent?: string;
        }> = {};

        logs?.forEach(log => {
          if (!emailActivity[log.recipient_email]) {
            emailActivity[log.recipient_email] = { bounces: 0, complaints: 0 };
          }
          if (!emailActivity[log.recipient_email].lastSent || 
              new Date(log.sent_at) > new Date(emailActivity[log.recipient_email].lastSent!)) {
            emailActivity[log.recipient_email].lastSent = log.sent_at;
          }
        });

        events?.forEach(event => {
          const log = logs?.find(l => l.id === event.email_log_id);
          if (!log) return;
          
          const email = log.recipient_email;
          if (!emailActivity[email]) {
            emailActivity[email] = { bounces: 0, complaints: 0 };
          }

          if (event.event_type === "bounced") {
            emailActivity[email].bounces++;
          } else if (event.event_type === "complained") {
            emailActivity[email].complaints++;
          } else if (event.event_type === "open") {
            if (!emailActivity[email].lastOpen || 
                new Date(event.created_at) > new Date(emailActivity[email].lastOpen!)) {
              emailActivity[email].lastOpen = event.created_at;
            }
          }
        });

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

        // Find candidates
        Object.entries(emailActivity).forEach(([email, activity]) => {
          if (cleanedEmails.has(email)) return;

          if (activity.bounces > 0) {
            candidates.push({ 
              email, 
              reason: "bounced", 
              bounceCount: activity.bounces 
            });
          } else if (activity.complaints > 0) {
            candidates.push({ 
              email, 
              reason: "complained", 
              complaintCount: activity.complaints 
            });
          } else if (!activity.lastOpen && activity.lastSent && new Date(activity.lastSent) < cutoffDate) {
            candidates.push({ 
              email, 
              reason: "inactive", 
              lastActivity: activity.lastSent 
            });
          }
        });

        console.log(`Found ${candidates.length} cleanup candidates`);
        return new Response(
          JSON.stringify({ data: candidates }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "clean_emails": {
        const { emails } = data || {};
        if (!emails || !Array.isArray(emails)) {
          return new Response(
            JSON.stringify({ error: "No emails provided" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Insert cleanup logs
        const cleanupRecords = emails.map((item: { email: string; reason: string }) => ({
          email: item.email,
          reason: item.reason,
          metadata: { cleaned_by: "admin", original_reason: item.reason }
        }));

        const { error: insertError } = await supabase
          .from("email_cleanup_log")
          .insert(cleanupRecords);

        if (insertError) throw insertError;

        // Mark emails as unsubscribed in preferences
        for (const item of emails) {
          await supabase
            .from("email_preferences")
            .upsert({
              email: item.email,
              subscribed: false,
              unsubscribed_at: new Date().toISOString(),
              unsubscribe_reason: `Automated cleanup: ${item.reason}`,
            }, { onConflict: "email" });
        }

        console.log(`Cleaned ${emails.length} emails from list`);
        return new Response(
          JSON.stringify({ success: true, cleaned: emails.length }),
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