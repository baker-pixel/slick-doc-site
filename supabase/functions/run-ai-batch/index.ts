import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/http.ts";
import { callAI as sharedCallAI } from "../_shared/ai.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { generateMonthlyReport } from "../run-automation/handlers/ai-automation.ts";
import type { ClientData as AutomationClientData } from "../run-automation/types.ts";

interface BatchConfig {
  batchType: 'daily' | 'weekly' | 'monthly';
  clientId?: string;
}

interface ClientData {
  id: string;
  business_name: string;
  email: string;
  tier: string;
  level: number;
  industry?: string;
}

function callAI(prompt: string, systemPrompt: string): Promise<string> {
  return sharedCallAI({
    source: "run-ai-batch",
    system: systemPrompt,
    prompt,
    maxTokens: 2048,
  });
}

// Map our content types to DB-allowed values
const contentTypeMap: Record<string, string> = {
  'google_post': 'other',
  'social_post': 'social_post',
  'email_newsletter': 'email',
  'blog_post': 'blog_post',
};

async function generateContent(supabase: any, client: ClientData & { context_profile?: any }, contentType: string): Promise<any> {
  const ctx = client.context_profile;
  const industry = client.industry || "local business";
  const biz = client.business_name;

  const contextBlock = ctx ? [
    ctx.business_summary || `${biz} is a ${industry} business.`,
    ctx.services?.length ? `Services: ${ctx.services.slice(0, 5).join(", ")}.` : "",
    ctx.differentiators?.length ? `Differentiators: ${ctx.differentiators.slice(0, 3).join(", ")}.` : "",
    ctx.target_audience ? `Target audience: ${ctx.target_audience}.` : "",
    ctx.location ? `Location: ${ctx.location}.` : "",
  ].filter(Boolean).join(" ") : `${biz} is a ${industry} business.`;

  const tone = ctx?.tone || "professional";
  const services = ctx?.services || [];
  const audience = ctx?.target_audience || "customers";

  const systemPrompt = `You are a professional marketing content writer for ${biz}. ${contextBlock} Brand tone: ${tone}. Write specific, authentic content — never generic filler.`;

  let prompt = '';
  let title = '';

  switch (contentType) {
    case 'google_post':
      prompt = `Write a Google Business Profile post for ${biz}. Highlight a specific service${services.length ? ` (${services[0]})` : ""} or a trust-building fact. Under 1,500 characters. Include a clear call to action. Speak directly to ${audience}.`;
      title = 'Google Business Profile Post';
      break;
    case 'social_post':
      prompt = `Write a LinkedIn post for ${biz}. Share an insight, tip, or win relevant to ${audience}${services.length ? ` around ${services[0]}` : ""}. 150–250 words. End with 3–5 hashtags.`;
      title = 'Social Media Post';
      break;
    case 'email_newsletter':
      prompt = `Write a marketing email for ${biz}.\nFormat:\nSubject: [specific subject line]\n---\nHi [First Name],\n\n[2–3 short paragraphs of value for ${audience}${services.length ? ` related to ${services[0]}` : ""}]\n\n[Clear CTA]\n\nThe ${biz} Team\n\nUnder 200 words. Helpful, not salesy.`;
      title = 'Email Newsletter';
      break;
    case 'blog_post':
      prompt = `Write a blog post for ${biz}. Topic: a practical how-to or FAQ that ${audience} would find genuinely useful${services.length ? ` about ${services[0]}` : ""}. Include: engaging title, intro, 3–4 sections with H2 headers, conclusion with CTA. 500–700 words.`;
      title = 'Blog Post Draft';
      break;
    default:
      prompt = `Write marketing content for ${biz} targeting ${audience}. 150–200 words. Reference their services (${services.slice(0, 2).join(", ") || industry}). Professional, specific, with a CTA.`;
      title = 'Marketing Content';
  }

  console.log(`Generating ${contentType} for ${client.business_name}...`);
  
  const content = await callAI(prompt, systemPrompt);
  const dbContentType = contentTypeMap[contentType] || 'other';
  
  // Save as pending_admin_review — admin must review before client sees it.
  // Do NOT create content_approvals here; that is the admin's job via ContentReviewPanel.
  const { data, error } = await supabase
    .from('generated_content')
    .insert({
      client_id: client.id,
      content_type: dbContentType,
      title,
      content,
      status: 'pending_admin_review',
      metadata: {
        generated_at: new Date().toISOString(),
        original_type: contentType,
        model: "llama-3.3-70b-versatile",
        source: "run-ai-batch",
      },
    })
    .select()
    .single();

  if (error) {
    console.error(`Error saving ${contentType}:`, error);
    return { success: false, error: error.message };
  }

  return { success: true, contentId: data.id };
}

// Monthly reports are generated via the shared ai-automation.ts implementation
// (generateMonthlyReport) rather than a separate implementation here. The
// version that used to live in this file asked the model to "use placeholder
// metrics like Website Traffic: [+15% MoM]" -- i.e. explicitly fabricate
// numbers with no basis in real data -- and stored the raw markdown output
// wrapped in {summary: text}/{content: text} instead of the structured
// {executive_summary, metrics, insights, recommendations} shape the rest of
// the app (ReportsReviewPanel, send-report-to-client) expects. That's what
// produced the malformed, duplicated-content report email a client actually
// received. The shared implementation also gets brand-kit context that this
// one never had.

async function processAutomatedTask(supabase: any, client: ClientData, task: any): Promise<any> {
  const systemPrompt = `You are an AI assistant helping ${client.business_name} with marketing tasks. Complete the following task professionally.`;
  
  const prompt = `Complete this marketing task for ${client.business_name}:
Task: ${task.name}
Description: ${task.description || 'No description provided'}
Instructions: ${task.instructions || 'Complete this task to the best of your ability'}

Provide a detailed output that can be reviewed by the team.`;

  console.log(`Processing task "${task.name}" for ${client.business_name}...`);
  
  const output = await callAI(prompt, systemPrompt);
  
  // Create automation job
  const { data: job, error: jobError } = await supabase
    .from('automation_jobs')
    .insert({
      client_id: client.id,
      job_type: task.category || 'custom',
      status: 'completed',
      input_data: { task_id: task.id, task_name: task.name },
      output_data: { result: output },
      ai_model_used: 'llama-3.3-70b-versatile',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (jobError) {
    console.error('Error creating job:', jobError);
  }

  // Update task as completed
  await supabase
    .from('client_tasks')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      automation_job_id: job?.id,
      output_data: { result: output },
    })
    .eq('id', task.id);

  // Create content approval for review
  await supabase.from('content_approvals').insert({
    client_account_id: client.id,
    content_type: 'automated_output',
    title: task.name,
    content_preview: output.substring(0, 500),
    full_content: output,
    status: 'pending',
  });

  return { success: true, jobId: job?.id };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
  try {
    const { batchType, clientId } = await req.json() as BatchConfig;
    
    console.log(`Starting ${batchType} AI batch process${clientId ? ` for client ${clientId}` : ' for all clients'}`);


    // Get active clients
    let clientQuery = supabase
      .from('client_accounts')
      .select('id, business_name, email, tier, level, industry, context_profile')
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
      tasksCompleted: 0,
      contentGenerated: 0,
      reportsCreated: 0,
      errors: [] as string[],
    };

    // Define what each batch type does.
    // generateContent is disabled here — content drafts are owned by the
    // fill-scheduled-content cron which feeds the admin review pipeline.
    // Enabling it here would create a duplicate, unreviewed content path.
    const batchActions = {
      daily: {
        processAutomatedTasks: true,
        generateContent: false,
        runReports: false,
      },
      weekly: {
        processAutomatedTasks: true,
        generateContent: false,
        runReports: false,
      },
      monthly: {
        processAutomatedTasks: true,
        generateContent: false,
        runReports: true,
      },
    };

    const config = batchActions[batchType];

    for (const client of clients || []) {
      try {
        console.log(`Processing client: ${client.business_name}`);

        // 1. Process automated tasks (FULL, AI, AUTOMATED types)
        if (config.processAutomatedTasks) {
          // For daily batches, run FULL automation tasks via auto-run-client-tasks
          try {
            console.log(`Running auto-run-client-tasks for ${client.business_name}...`);
            
            // Call the auto-run-client-tasks function
            const { data: autoRunResult, error: autoRunError } = await supabase.functions.invoke('auto-run-client-tasks', {
              body: { clientId: client.id },
            });

            if (autoRunError) {
              console.error(`Auto-run error for ${client.business_name}:`, autoRunError);
              results.errors.push(`Auto-run error for ${client.business_name}: ${autoRunError.message}`);
            } else {
              results.tasksCompleted += autoRunResult?.completed || 0;
              console.log(`Auto-run completed: ${autoRunResult?.completed || 0} tasks for ${client.business_name}`);
            }
          } catch (autoRunErr) {
            console.error(`Auto-run exception for ${client.business_name}:`, autoRunErr);
            results.errors.push(`Auto-run exception for ${client.business_name}: ${autoRunErr}`);
          }

          // Also process AI/AUTOMATED type tasks
          const { data: pendingTasks, error: tasksError } = await supabase
            .from('client_tasks')
            .select('*')
            .eq('client_account_id', client.id)
            .eq('status', 'pending')
            .in('automation_type', ['AI', 'AUTOMATED'])
            .limit(5); // Limit tasks per client per batch

          if (tasksError) {
            console.error(`Error fetching tasks for ${client.business_name}:`, tasksError);
            results.errors.push(`Tasks error for ${client.business_name}: ${tasksError.message}`);
          } else {
            for (const task of pendingTasks || []) {
              // Idempotency: atomically claim before processing so an
              // overlapping cron run (or a manual + scheduled run colliding)
              // can't double-fire the AI call and duplicate content_approvals.
              const { data: claimed } = await supabase
                .from('client_tasks')
                .update({ status: 'in_progress', started_at: new Date().toISOString() })
                .eq('id', task.id)
                .eq('status', 'pending')
                .select('id')
                .maybeSingle();
              if (!claimed) continue;

              try {
                const taskResult = await processAutomatedTask(supabase, client, task);
                if (taskResult.success) {
                  results.tasksCompleted++;
                }
              } catch (taskError) {
                console.error(`Error processing task ${task.name}:`, taskError);
                results.errors.push(`Task "${task.name}" error: ${taskError}`);
                await supabase
                  .from('client_tasks')
                  .update({ status: 'failed', notes: String(taskError).slice(0, 500) })
                  .eq('id', task.id)
                  .eq('status', 'in_progress');
              }
            }
          }
        }

        // 2. Generate content (weekly/monthly)
        if (config.generateContent) {
          const contentTypes = tierPolicy(client.tier).social.contentTypes;

          for (const contentType of contentTypes) {
            try {
              const contentResult = await generateContent(supabase, client, contentType);
              if (contentResult.success) {
                results.contentGenerated++;
              }
            } catch (contentError) {
              console.error(`Error generating ${contentType}:`, contentError);
              results.errors.push(`Content "${contentType}" error: ${contentError}`);
            }
          }

          // Log activity
          await supabase.from('activity_feed').insert({
            client_account_id: client.id,
            activity_type: 'content_batch',
            title: `${batchType.charAt(0).toUpperCase() + batchType.slice(1)} content batch completed`,
            description: `AI generated ${contentTypes.length} content pieces`,
            icon: 'sparkles',
          });
        }

        // 3. Run reports (monthly)
        if (config.runReports) {
          try {
            await generateMonthlyReport(supabase, client as AutomationClientData);
            results.reportsCreated++;
          } catch (reportError) {
            console.error(`Error generating report:`, reportError);
            results.errors.push(`Report error for ${client.business_name}: ${reportError}`);
          }

          // Log activity
          await supabase.from('activity_feed').insert({
            client_account_id: client.id,
            activity_type: 'report_generated',
            title: 'Monthly performance report generated',
            description: 'AI generated the monthly performance analysis',
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
      message: `Processed ${results.processed} clients. Tasks: ${results.tasksCompleted}, Content: ${results.contentGenerated}, Reports: ${results.reportsCreated}`,
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

    await supabase.from('automation_alerts').insert({
      alert_type: 'function_error',
      severity: 'error',
      title: `Error in run-ai-batch`,
      message: error instanceof Error ? error.message : 'Unknown error',
      source: 'run-ai-batch',
      metadata: {
        function_name: 'run-ai-batch',
        client_id: null,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    });
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
