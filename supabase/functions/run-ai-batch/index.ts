import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BatchConfig {
  batchType: 'daily' | 'weekly' | 'monthly';
  clientId?: string; // Optional: run for specific client
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { batchType, clientId } = await req.json() as BatchConfig;
    
    console.log(`Starting ${batchType} AI batch process${clientId ? ` for client ${clientId}` : ' for all clients'}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get active clients
    let clientQuery = supabase
      .from('client_accounts')
      .select('*')
      .eq('status', 'active');
    
    if (clientId) {
      clientQuery = clientQuery.eq('id', clientId);
    }

    const { data: clients, error: clientsError } = await clientQuery;
    
    if (clientsError) {
      console.error('Error fetching clients:', clientsError);
      throw clientsError;
    }

    console.log(`Processing ${clients?.length || 0} active clients`);

    const results = {
      processed: 0,
      tasksCreated: 0,
      contentGenerated: 0,
      reportsCreated: 0,
      errors: [] as string[],
    };

    // Define what each batch type does
    const batchActions = {
      daily: {
        processAutomatedTasks: true,
        generateContent: false,
        runReports: false,
        taskCategories: ['social_post', 'review_response', 'lead_followup'],
      },
      weekly: {
        processAutomatedTasks: true,
        generateContent: true,
        runReports: false,
        taskCategories: ['blog_draft', 'email_campaign', 'content_calendar', 'seo_audit'],
      },
      monthly: {
        processAutomatedTasks: true,
        generateContent: true,
        runReports: true,
        taskCategories: ['performance_report', 'strategy_review', 'competitor_analysis', 'full_audit'],
      },
    };

    const config = batchActions[batchType];

    for (const client of clients || []) {
      try {
        console.log(`Processing client: ${client.business_name}`);

        // 1. Process automated tasks
        if (config.processAutomatedTasks) {
          const { data: pendingTasks, error: tasksError } = await supabase
            .from('client_tasks')
            .select('*')
            .eq('client_account_id', client.id)
            .eq('status', 'pending')
            .in('automation_type', ['AI', 'AUTOMATED']);

          if (tasksError) {
            console.error(`Error fetching tasks for ${client.business_name}:`, tasksError);
            results.errors.push(`Tasks error for ${client.business_name}: ${tasksError.message}`);
          } else {
            // Mark tasks as in-progress and create automation jobs
            for (const task of pendingTasks || []) {
              const { data: job, error: jobError } = await supabase
                .from('automation_jobs')
                .insert({
                  client_id: client.id,
                  job_type: task.category,
                  status: 'pending',
                  input_data: {
                    task_id: task.id,
                    task_name: task.name,
                    batch_type: batchType,
                  },
                })
                .select()
                .single();

              if (!jobError && job) {
                await supabase
                  .from('client_tasks')
                  .update({
                    status: 'in_progress',
                    automation_job_id: job.id,
                  })
                  .eq('id', task.id);

                results.tasksCreated++;
              }
            }
          }
        }

        // 2. Generate content (weekly/monthly)
        if (config.generateContent) {
          // Create content generation tasks based on tier
          const contentTypes = client.tier === 'foundation' 
            ? ['google_post']
            : client.tier === 'growth'
            ? ['google_post', 'social_post', 'email_newsletter']
            : ['google_post', 'social_post', 'email_newsletter', 'blog_post'];

          for (const contentType of contentTypes) {
            const { error: contentError } = await supabase
              .from('generated_content')
              .insert({
                client_account_id: client.id,
                content_type: contentType,
                status: 'pending',
                metadata: {
                  batch_type: batchType,
                  scheduled_at: new Date().toISOString(),
                },
              });

            if (!contentError) {
              results.contentGenerated++;
            }
          }

          // Log activity
          await supabase.from('activity_feed').insert({
            client_account_id: client.id,
            activity_type: 'content_batch',
            title: `${batchType.charAt(0).toUpperCase() + batchType.slice(1)} content batch started`,
            description: `AI content generation initiated for ${contentTypes.length} content types`,
            icon: 'sparkles',
          });
        }

        // 3. Run reports (monthly)
        if (config.runReports) {
          const reportPeriodStart = new Date();
          reportPeriodStart.setMonth(reportPeriodStart.getMonth() - 1);
          
          const { error: reportError } = await supabase
            .from('client_reports')
            .insert({
              client_id: client.id,
              report_type: 'performance',
              report_period_start: reportPeriodStart.toISOString().split('T')[0],
              report_period_end: new Date().toISOString().split('T')[0],
              metrics: {
                status: 'generating',
                batch_type: batchType,
              },
            });

          if (!reportError) {
            results.reportsCreated++;
          }

          // Log activity
          await supabase.from('activity_feed').insert({
            client_account_id: client.id,
            activity_type: 'report_generated',
            title: 'Monthly performance report started',
            description: 'AI is generating the monthly performance analysis',
            icon: 'file-text',
          });
        }

        results.processed++;
      } catch (clientError) {
        console.error(`Error processing client ${client.business_name}:`, clientError);
        results.errors.push(`Error for ${client.business_name}: ${clientError}`);
      }
    }

    // Create an automation alert with summary
    await supabase.from('automation_alerts').insert({
      alert_type: 'batch_complete',
      severity: results.errors.length > 0 ? 'warning' : 'info',
      title: `${batchType.charAt(0).toUpperCase() + batchType.slice(1)} AI Batch Complete`,
      message: `Processed ${results.processed} clients. Tasks: ${results.tasksCreated}, Content: ${results.contentGenerated}, Reports: ${results.reportsCreated}`,
      metadata: results,
    });

    console.log('Batch processing complete:', results);

    return new Response(JSON.stringify({
      success: true,
      batchType,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Batch processing error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
