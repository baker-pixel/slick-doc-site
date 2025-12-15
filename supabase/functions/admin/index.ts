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
      case "authenticate": {
        // Password already validated above, just return success
        console.log("Admin authenticated successfully");
        return new Response(
          JSON.stringify({ authenticated: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create_meeting": {
        const {
          client_account_id,
          title,
          scheduled_at,
          meeting_type = "kickoff",
          duration_minutes = 60,
          meeting_link = null,
          description = null,
          notes = null,
        } = data || {};

        if (!client_account_id || !title || !scheduled_at) {
          return new Response(
            JSON.stringify({ error: "client_account_id, title, and scheduled_at are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: meeting, error } = await supabase
          .from("client_meetings")
          .insert({
            client_account_id,
            title,
            scheduled_at,
            meeting_type,
            duration_minutes,
            meeting_link,
            description,
            notes,
            status: "scheduled",
          })
          .select()
          .single();

        if (error) throw error;

        // Record kickoff in onboarding + client record (best-effort)
        await supabase
          .from("client_onboarding")
          .upsert(
            {
              client_account_id,
              kickoff_scheduled_at: scheduled_at,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "client_account_id" }
          );

        await supabase
          .from("client_accounts")
          .update({ kickoff_scheduled_at: scheduled_at })
          .eq("id", client_account_id);

        return new Response(
          JSON.stringify({ data: meeting }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fetch": {
        // Fetch all admin data in one call
        const [contactsResult, gapResult, pdfResult] = await Promise.all([
          supabase.from("contact_submissions").select("*").order("created_at", { ascending: false }),
          supabase.from("gap_analysis_submissions").select("*").order("created_at", { ascending: false }),
          supabase.from("pdf_leads").select("*").order("created_at", { ascending: false }),
        ]);

        if (contactsResult.error) throw contactsResult.error;
        if (gapResult.error) throw gapResult.error;
        if (pdfResult.error) throw pdfResult.error;

        console.log(`Fetched ${contactsResult.data?.length || 0} contacts, ${gapResult.data?.length || 0} gap analyses, ${pdfResult.data?.length || 0} PDF leads`);
        return new Response(
          JSON.stringify({ 
            contacts: contactsResult.data,
            gapAnalyses: gapResult.data,
            pdfLeads: pdfResult.data
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
        if (!data || Object.keys(data).length === 0) {
          console.log("Update called with empty data object");
          return new Response(
            JSON.stringify({ error: "No data provided for update" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Special handling for client_onboarding - use upsert since record may not exist
        if (table === "client_onboarding") {
          const { data: updated, error } = await supabase
            .from("client_onboarding")
            .upsert(
              { client_account_id: id, ...data, updated_at: new Date().toISOString() },
              { onConflict: "client_account_id" }
            )
            .select()
            .maybeSingle();
          
          if (error) throw error;
          console.log(`Upserted client_onboarding for client: ${id}`);
          return new Response(
            JSON.stringify({ data: updated }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const { data: updated, error } = await supabase
          .from(table)
          .update(data)
          .eq("id", id)
          .select()
          .maybeSingle();
        
        if (error) throw error;
        if (!updated) {
          console.log(`No record found to update in ${table} with id: ${id}`);
          return new Response(
            JSON.stringify({ error: "Record not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
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

      case "create_invitation": {
        const { client_account_id, email, first_name, last_name } = data || {};
        
        if (!client_account_id || !email) {
          return new Response(
            JSON.stringify({ error: "client_account_id and email are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: invitation, error: insertError } = await supabase
          .from("client_invitations")
          .insert({
            client_account_id,
            email,
            first_name: first_name || null,
            last_name: last_name || null,
            invited_by: "Admin",
          })
          .select()
          .single();

        if (insertError) throw insertError;

        console.log(`Created invitation for ${email} to client ${client_account_id}`);
        return new Response(
          JSON.stringify({ data: invitation }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create_client_account": {
        const { email, business_name, first_name, last_name, tier, industry } = data || {};
        
        if (!email || !business_name) {
          return new Response(
            JSON.stringify({ error: "email and business_name are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check if client account already exists with same email AND business name
        const { data: existing } = await supabase
          .from("client_accounts")
          .select("id")
          .eq("email", email)
          .eq("business_name", business_name)
          .maybeSingle();

        if (existing) {
          return new Response(
            JSON.stringify({ error: "A client account with this email and business name already exists", existingId: existing.id }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: newClient, error: insertError } = await supabase
          .from("client_accounts")
          .insert({
            email,
            business_name,
            first_name: first_name || null,
            last_name: last_name || null,
            tier: tier || "foundation",
            industry: industry || null,
            status: "active",
          })
          .select()
          .single();

        if (insertError) throw insertError;

        console.log(`Created client account for ${business_name} (${email})`);
        return new Response(
          JSON.stringify({ data: newClient }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete_invitation": {
        const { error: deleteError } = await supabase
          .from("client_invitations")
          .delete()
          .eq("id", id);

        if (deleteError) throw deleteError;

        console.log(`Deleted invitation ${id}`);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "list_invitations": {
        const { data: invitations, error: listError } = await supabase
          .from("client_invitations")
          .select("*")
          .order("created_at", { ascending: false });

        if (listError) throw listError;

        return new Response(
          JSON.stringify({ data: invitations }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "list_portal_users": {
        const { data: portalUsers, error: listError } = await supabase
          .from("client_portal_users")
          .select("*")
          .order("created_at", { ascending: false });

        if (listError) throw listError;

        return new Response(
          JSON.stringify({ data: portalUsers }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "send_message": {
        const { client_account_id, message, sender_name } = data || {};
        
        if (!client_account_id || !message) {
          return new Response(
            JSON.stringify({ error: "client_account_id and message are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: newMessage, error: insertError } = await supabase
          .from("client_messages")
          .insert({
            client_account_id,
            sender_type: "agency",
            sender_name: sender_name || "Agency Team",
            message,
            is_read: false,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        console.log(`Sent message to client ${client_account_id}`);
        return new Response(
          JSON.stringify({ data: newMessage }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "mark_message_read": {
        const { error: updateError } = await supabase
          .from("client_messages")
          .update({ is_read: true })
          .eq("id", id);

        if (updateError) throw updateError;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_messages": {
        const { client_account_id } = data || {};
        
        if (!client_account_id) {
          return new Response(
            JSON.stringify({ error: "client_account_id is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: messagesData, error: messagesError } = await supabase
          .from("client_messages")
          .select("*")
          .eq("client_account_id", client_account_id)
          .order("created_at", { ascending: true });

        if (messagesError) throw messagesError;

        return new Response(
          JSON.stringify({ data: messagesData }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_requests": {
        const { data: requestsData, error: requestsError } = await supabase
          .from("client_requests")
          .select("*, client_accounts(business_name)")
          .order("created_at", { ascending: false });

        if (requestsError) throw requestsError;

        return new Response(
          JSON.stringify({ data: requestsData }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "update_request": {
        if (!id) {
          return new Response(
            JSON.stringify({ error: "Request ID is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { status, admin_notes, assigned_to, due_date, completed_at } = data || {};

        const { error: updateError } = await supabase
          .from("client_requests")
          .update({
            status,
            admin_notes,
            assigned_to,
            due_date,
            completed_at,
          })
          .eq("id", id);

        if (updateError) throw updateError;

        console.log(`Updated request ${id}`);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_brand_assets": {
        const { data: assetsData, error: assetsError } = await supabase
          .from("brand_assets")
          .select("*, client_accounts(business_name)")
          .order("created_at", { ascending: false });

        if (assetsError) throw assetsError;

        return new Response(
          JSON.stringify({ data: assetsData }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create_brand_asset": {
        const { client_account_id, name, description, asset_type, category, file_path, file_url, metadata, is_primary } = data || {};
        
        if (!client_account_id || !name) {
          return new Response(
            JSON.stringify({ error: "client_account_id and name are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: newAsset, error: insertError } = await supabase
          .from("brand_assets")
          .insert({
            client_account_id,
            name,
            description,
            asset_type: asset_type || "other",
            category: category || "general",
            file_path,
            file_url,
            metadata: metadata || {},
            is_primary: is_primary || false,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        console.log(`Created brand asset for client ${client_account_id}`);
        return new Response(
          JSON.stringify({ data: newAsset }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete_brand_asset": {
        if (!id) {
          return new Response(
            JSON.stringify({ error: "Asset ID is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error: deleteError } = await supabase
          .from("brand_assets")
          .delete()
          .eq("id", id);

        if (deleteError) throw deleteError;

        console.log(`Deleted brand asset ${id}`);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "list_activities": {
        const { client_account_id } = data || {};
        let query = supabase.from("activity_feed").select("*").order("created_at", { ascending: false }).limit(100);
        
        if (client_account_id) {
          query = query.eq("client_account_id", client_account_id);
        }
        
        const { data: activities, error } = await query;
        if (error) throw error;
        
        return new Response(
          JSON.stringify({ data: activities }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create_activity": {
        const { client_account_id, activity_type, title, description, icon, metadata } = data || {};
        
        if (!client_account_id || !activity_type || !title) {
          return new Response(
            JSON.stringify({ error: "client_account_id, activity_type, and title are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: activity, error } = await supabase
          .from("activity_feed")
          .insert({
            client_account_id,
            activity_type,
            title,
            description: description || null,
            icon: icon || "activity",
            metadata: metadata || {},
          })
          .select()
          .single();

        if (error) throw error;
        console.log(`Created activity for client ${client_account_id}: ${title}`);
        return new Response(
          JSON.stringify({ data: activity }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete_activity": {
        const { error: deleteError } = await supabase
          .from("activity_feed")
          .delete()
          .eq("id", id);

        if (deleteError) throw deleteError;

        console.log(`Deleted activity ${id}`);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "list_team_members": {
        const { data: members, error } = await supabase
          .from("team_members")
          .select("*")
          .order("display_order", { ascending: true });
        
        if (error) throw error;
        return new Response(
          JSON.stringify({ data: members }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create_team_member": {
        const { name, role, email, phone, photo_url, bio, specialties, is_active, display_order } = data || {};
        
        if (!name || !role) {
          return new Response(
            JSON.stringify({ error: "name and role are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: member, error } = await supabase
          .from("team_members")
          .insert({
            name,
            role,
            email: email || null,
            phone: phone || null,
            photo_url: photo_url || null,
            bio: bio || null,
            specialties: specialties || [],
            is_active: is_active ?? true,
            display_order: display_order || 0,
          })
          .select()
          .single();

        if (error) throw error;
        console.log(`Created team member: ${name}`);
        return new Response(
          JSON.stringify({ data: member }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "update_team_member": {
        const { name, role, email, phone, photo_url, bio, specialties, is_active, display_order } = data || {};

        const { data: member, error } = await supabase
          .from("team_members")
          .update({
            name,
            role,
            email: email || null,
            phone: phone || null,
            photo_url: photo_url || null,
            bio: bio || null,
            specialties: specialties || [],
            is_active: is_active ?? true,
            display_order: display_order || 0,
          })
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        console.log(`Updated team member: ${id}`);
        return new Response(
          JSON.stringify({ data: member }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete_team_member": {
        const { error: deleteError } = await supabase
          .from("team_members")
          .delete()
          .eq("id", id);

        if (deleteError) throw deleteError;

        console.log(`Deleted team member ${id}`);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "list_deliverables": {
        const { data: deliverables, error } = await supabase
          .from("deliverables")
          .select("*")
          .order("submitted_at", { ascending: false });
        
        if (error) throw error;
        return new Response(
          JSON.stringify({ data: deliverables }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create_deliverable": {
        const { client_account_id, title, description, category, file_url, file_name, preview_url } = data || {};
        
        if (!client_account_id || !title) {
          return new Response(
            JSON.stringify({ error: "client_account_id and title are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // For audit reports, auto-populate with gap analysis data
        let auditContent: string | null = null;
        if (category === "report" && title.toLowerCase().includes("audit")) {
          // Get client info to find their gap analysis
          const { data: client } = await supabase
            .from("client_accounts")
            .select("email, business_name")
            .eq("id", client_account_id)
            .single();

          if (client) {
            // Find gap analysis by email or business name
            const { data: gapAnalysis } = await supabase
              .from("gap_analysis_submissions")
              .select("*")
              .or(`email.eq.${client.email},business_name.ilike.%${client.business_name}%`)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (gapAnalysis?.ai_analysis) {
              const analysis = gapAnalysis.ai_analysis as {
                executive_summary?: string;
                identified_gaps?: Array<{ category: string; gap: string; severity: string; recommendation: string }>;
                recommendations?: Array<{ priority: number; action: string; impact: string; timeframe: string }>;
                strengths?: string[];
              };

              // Build audit report content
              const sections = [];
              
              sections.push(`# Marketing Audit Report for ${gapAnalysis.business_name}\n`);
              sections.push(`*Prepared on ${new Date().toLocaleDateString()}*\n`);
              
              // Executive Summary
              if (analysis.executive_summary) {
                sections.push(`## Executive Summary\n\n${analysis.executive_summary}\n`);
              }
              
              // Key Strengths
              if (analysis.strengths && analysis.strengths.length > 0) {
                sections.push(`## Current Strengths\n\n${analysis.strengths.map(s => `- ${s}`).join('\n')}\n`);
              }
              
              // Identified Gaps
              if (analysis.identified_gaps && analysis.identified_gaps.length > 0) {
                sections.push(`## Identified Gaps\n`);
                analysis.identified_gaps.forEach((gap, idx) => {
                  sections.push(`### ${idx + 1}. ${gap.category}\n`);
                  sections.push(`**Issue:** ${gap.gap}\n`);
                  sections.push(`**Severity:** ${gap.severity}\n`);
                  sections.push(`**Recommendation:** ${gap.recommendation}\n`);
                });
              }
              
              // Priority Recommendations
              if (analysis.recommendations && analysis.recommendations.length > 0) {
                sections.push(`## Priority Recommendations\n`);
                analysis.recommendations.forEach((rec, idx) => {
                  sections.push(`### Priority ${rec.priority}: ${rec.action}\n`);
                  sections.push(`- **Expected Impact:** ${rec.impact}`);
                  sections.push(`- **Timeframe:** ${rec.timeframe}\n`);
                });
              }
              
              // Business Context from inputs
              sections.push(`## Business Context\n`);
              if (gapAnalysis.top_business_goals) {
                sections.push(`**Goals:** ${gapAnalysis.top_business_goals}\n`);
              }
              if (gapAnalysis.monthly_marketing_budget) {
                sections.push(`**Budget:** ${gapAnalysis.monthly_marketing_budget}\n`);
              }
              if (gapAnalysis.top_competitors) {
                sections.push(`**Key Competitors:** ${gapAnalysis.top_competitors}\n`);
              }
              if (gapAnalysis.unique_differentiator) {
                sections.push(`**Differentiator:** ${gapAnalysis.unique_differentiator}\n`);
              }
              
              auditContent = sections.join('\n');
              console.log(`Generated audit content from gap analysis for ${client.business_name}`);
            }
          }
        }

        const { data: deliverable, error } = await supabase
          .from("deliverables")
          .insert({
            client_account_id,
            title,
            description: auditContent || description || null,
            category: category || "general",
            file_url: file_url || null,
            file_name: file_name || null,
            preview_url: preview_url || null,
            status: "pending_review",
          })
          .select()
          .single();

        if (error) throw error;
        console.log(`Created deliverable: ${title}${auditContent ? ' (with audit content)' : ''}`);
        return new Response(
          JSON.stringify({ data: deliverable, hasAuditContent: !!auditContent }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "update_deliverable": {
        const updateData = data || {};

        const { data: deliverable, error } = await supabase
          .from("deliverables")
          .update(updateData)
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        console.log(`Updated deliverable: ${id}`);
        return new Response(
          JSON.stringify({ data: deliverable }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete_deliverable": {
        const { error: deleteError } = await supabase
          .from("deliverables")
          .delete()
          .eq("id", id);

        if (deleteError) throw deleteError;

        console.log(`Deleted deliverable ${id}`);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fetch_settings": {
        const { data: settings, error } = await supabase
          .from("admin_settings")
          .select("*")
          .order("key", { ascending: true });

        if (error) throw error;
        console.log(`Fetched ${settings?.length || 0} admin settings`);
        return new Response(
          JSON.stringify({ settings }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "update_setting": {
        const { settingId, value, description } = data || {};
        
        const { data: setting, error } = await supabase
          .from("admin_settings")
          .update({ value, description, updated_at: new Date().toISOString() })
          .eq("id", settingId)
          .select()
          .single();

        if (error) throw error;
        console.log(`Updated setting: ${settingId}`);
        return new Response(
          JSON.stringify({ data: setting }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "add_setting": {
        const { key, value: settingValue, description: settingDesc } = data || {};
        
        const { data: setting, error } = await supabase
          .from("admin_settings")
          .insert({ key, value: settingValue, description: settingDesc })
          .select()
          .single();

        if (error) throw error;
        console.log(`Added setting: ${key}`);
        return new Response(
          JSON.stringify({ data: setting }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete_setting": {
        const { settingId } = data || {};
        
        const { error } = await supabase
          .from("admin_settings")
          .delete()
          .eq("id", settingId);

        if (error) throw error;
        console.log(`Deleted setting: ${settingId}`);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fetch_activities": {
        const { data: activities, error } = await supabase
          .from("activity_feed")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500);

        if (error) throw error;
        console.log(`Fetched ${activities?.length || 0} activities`);
        return new Response(
          JSON.stringify({ activities }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "fetch_client_accounts": {
        const { data: clients, error } = await supabase
          .from("client_accounts")
          .select("id, business_name")
          .order("business_name", { ascending: true });

        if (error) throw error;
        console.log(`Fetched ${clients?.length || 0} client accounts`);
        return new Response(
          JSON.stringify({ clients }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create_project": {
        const {
          client_account_id,
          name,
          description = null,
          status = "in_progress",
          start_date = null,
          target_end_date = null,
          progress_percentage = 0,
        } = data || {};

        if (!client_account_id || !name) {
          return new Response(
            JSON.stringify({ error: "client_account_id and name are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: project, error } = await supabase
          .from("client_projects")
          .insert({
            client_account_id,
            name,
            description,
            status,
            start_date: start_date || new Date().toISOString().split("T")[0],
            target_end_date,
            progress_percentage,
          })
          .select()
          .single();

        if (error) throw error;
        console.log(`Created project: ${name} for client: ${client_account_id}`);
        return new Response(
          JSON.stringify({ data: project }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create_project_with_milestones": {
        const {
          client_account_id,
          name,
          description = null,
          milestones = [],
        } = data || {};

        if (!client_account_id || !name) {
          return new Response(
            JSON.stringify({ error: "client_account_id and name are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const startDate = new Date().toISOString().split("T")[0];

        // Create the project first
        const { data: project, error: projectError } = await supabase
          .from("client_projects")
          .insert({
            client_account_id,
            name,
            description,
            status: "in_progress",
            start_date: startDate,
            progress_percentage: 0,
          })
          .select()
          .single();

        if (projectError) throw projectError;

        // Create milestones if any
        if (milestones.length > 0) {
          const milestonesToInsert = milestones.map((m: any, index: number) => {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + (m.days_from_start || 0));
            
            return {
              project_id: project.id,
              name: m.name,
              description: m.description || null,
              due_date: dueDate.toISOString().split("T")[0],
              status: "pending",
              sort_order: m.sort_order ?? index,
            };
          });

          const { error: milestonesError } = await supabase
            .from("project_milestones")
            .insert(milestonesToInsert);

          if (milestonesError) {
            console.error("Error creating milestones:", milestonesError);
            // Don't fail the whole operation, project was created
          }
        }

        console.log(`Created project "${name}" with ${milestones.length} milestones for client: ${client_account_id}`);
        return new Response(
          JSON.stringify({ data: { project, milestonesCount: milestones.length } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "generate_client_tasks": {
        const { client_id } = data || {};
        
        if (!client_id) {
          return new Response(
            JSON.stringify({ error: "client_id is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get client info
        const { data: client, error: clientError } = await supabase
          .from("client_accounts")
          .select("id, tier, business_name, email")
          .eq("id", client_id)
          .single();

        if (clientError || !client) {
          return new Response(
            JSON.stringify({ error: "Client not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get task templates for this tier
        const { data: templates, error: templatesError } = await supabase
          .from("task_templates")
          .select("*")
          .eq("tier", client.tier)
          .eq("is_active", true)
          .order("order_index");

        if (templatesError) throw templatesError;

        if (!templates || templates.length === 0) {
          return new Response(
            JSON.stringify({ error: `No task templates found for tier: ${client.tier}` }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Create tasks from templates
        const tasksToInsert = templates.map((t: any) => ({
          client_account_id: client_id,
          task_template_id: t.id,
          name: t.name,
          description: t.description,
          instructions: t.instructions,
          category: t.category,
          automation_type: t.automation_type,
          status: "pending",
        }));

        const { data: insertedTasks, error: insertError } = await supabase
          .from("client_tasks")
          .insert(tasksToInsert)
          .select();

        if (insertError) throw insertError;

        // Create onboarding record if not exists
        await supabase
          .from("client_onboarding")
          .upsert(
            { client_account_id: client_id },
            { onConflict: "client_account_id" }
          );

        console.log(`Generated ${insertedTasks?.length || 0} tasks for client: ${client.business_name}`);
        return new Response(
          JSON.stringify({ 
            success: true, 
            tasksGenerated: insertedTasks?.length || 0,
            client: client.business_name 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "createContentApproval": {
        const { approval } = await req.clone().json();
        if (!approval?.client_account_id || !approval?.title || !approval?.content_type) {
          return new Response(
            JSON.stringify({ error: "client_account_id, title, and content_type are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: newApproval, error } = await supabase
          .from("content_approvals")
          .insert({
            client_account_id: approval.client_account_id,
            title: approval.title,
            content_type: approval.content_type,
            content_preview: approval.content_preview || null,
            full_content: approval.full_content || null,
            status: approval.status || "pending",
          })
          .select()
          .single();

        if (error) throw error;
        console.log(`Created content approval: ${newApproval.id}`);
        return new Response(
          JSON.stringify({ data: newApproval }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "createClientNotification": {
        const { notification } = await req.clone().json();
        if (!notification?.client_account_id || !notification?.title || !notification?.notification_type) {
          return new Response(
            JSON.stringify({ error: "client_account_id, title, and notification_type are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: newNotification, error } = await supabase
          .from("client_notifications")
          .insert({
            client_account_id: notification.client_account_id,
            title: notification.title,
            description: notification.description || null,
            notification_type: notification.notification_type,
            priority: notification.priority || "medium",
            is_read: false,
          })
          .select()
          .single();

        if (error) throw error;
        console.log(`Created client notification: ${newNotification.id}`);
        return new Response(
          JSON.stringify({ data: newNotification }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "updateClientTask": {
        const { taskId, updates } = await req.clone().json();
        if (!taskId) {
          return new Response(
            JSON.stringify({ error: "taskId is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: updatedTask, error } = await supabase
          .from("client_tasks")
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", taskId)
          .select()
          .single();

        if (error) throw error;
        console.log(`Updated client task: ${taskId}`);
        return new Response(
          JSON.stringify({ data: updatedTask }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "updateDeliverable": {
        const { deliverableId, updates } = await req.clone().json();
        if (!deliverableId) {
          return new Response(
            JSON.stringify({ error: "deliverableId is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: updatedDeliverable, error } = await supabase
          .from("deliverables")
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", deliverableId)
          .select()
          .single();

        if (error) throw error;
        console.log(`Updated deliverable: ${deliverableId}`);
        return new Response(
          JSON.stringify({ data: updatedDeliverable }),
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