import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BatchConfig {
  batchType: 'daily' | 'weekly' | 'monthly';
  clientId?: string;
}

interface ClientData {
  id: string;
  business_name: string;
  email: string;
  tier: string;
  industry?: string;
}

async function callAI(prompt: string, systemPrompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('AI API error:', response.status, errorText);
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Map our content types to DB-allowed values
const contentTypeMap: Record<string, string> = {
  'google_post': 'other',
  'social_post': 'social_post',
  'email_newsletter': 'email',
  'blog_post': 'blog_post',
};

async function generateContent(supabase: any, client: ClientData, contentType: string): Promise<any> {
  const systemPrompt = `You are a professional marketing content writer for ${client.business_name}${client.industry ? ` in the ${client.industry} industry` : ''}. Create engaging, professional content.`;
  
  let prompt = '';
  let title = '';
  
  switch (contentType) {
    case 'google_post':
      prompt = `Write a Google Business Profile post for ${client.business_name}. Keep it under 1500 characters, engaging, and include a call to action. Focus on building trust and showcasing expertise.`;
      title = 'Google Business Profile Post';
      break;
    case 'social_post':
      prompt = `Write a professional social media post for ${client.business_name}. Make it engaging with relevant hashtags. Focus on providing value to followers.`;
      title = 'Social Media Post';
      break;
    case 'email_newsletter':
      prompt = `Write a short email newsletter for ${client.business_name} customers. Include a compelling subject line, brief valuable content, and a clear call to action. Keep it under 300 words.`;
      title = 'Email Newsletter';
      break;
    case 'blog_post':
      prompt = `Write a blog post outline with introduction for ${client.business_name}. Include a catchy title, 3-5 main sections with bullet points, and a conclusion. Focus on topics relevant to their customers.`;
      title = 'Blog Post Draft';
      break;
    default:
      prompt = `Write marketing content for ${client.business_name}.`;
      title = 'Marketing Content';
  }

  console.log(`Generating ${contentType} for ${client.business_name}...`);
  
  const content = await callAI(prompt, systemPrompt);
  const dbContentType = contentTypeMap[contentType] || 'other';
  
  const { data, error } = await supabase
    .from('generated_content')
    .insert({
      client_id: client.id,
      content_type: dbContentType,
      title,
      content,
      status: 'draft',
      metadata: {
        generated_at: new Date().toISOString(),
        original_type: contentType,
        model: 'google/gemini-2.5-flash',
      },
    })
    .select()
    .single();

  if (error) {
    console.error(`Error saving ${contentType}:`, error);
    return { success: false, error: error.message };
  }

  // Create content approval record
  await supabase.from('content_approvals').insert({
    client_account_id: client.id,
    content_id: data.id,
    content_type: contentType,
    title,
    content_preview: content.substring(0, 500),
    full_content: content,
    status: 'pending',
  });

  return { success: true, contentId: data.id };
}

async function generateReport(supabase: any, client: ClientData): Promise<any> {
  const systemPrompt = `You are a marketing analytics expert creating a monthly performance report for ${client.business_name}. Be professional and data-driven.`;
  
  const prompt = `Create a monthly marketing performance summary report for ${client.business_name}. Include sections for:
1. Executive Summary (2-3 sentences)
2. Key Metrics Overview (use placeholder metrics like "Website Traffic: [+15% MoM]")
3. Top Achievements This Month (3 bullet points)
4. Areas for Improvement (2-3 bullet points)  
5. Recommendations for Next Month (3 action items)
6. Looking Ahead (brief outlook)

Format it professionally with clear headers.`;

  console.log(`Generating monthly report for ${client.business_name}...`);
  
  const reportContent = await callAI(prompt, systemPrompt);
  
  const reportPeriodStart = new Date();
  reportPeriodStart.setMonth(reportPeriodStart.getMonth() - 1);
  
  const { data, error } = await supabase
    .from('client_reports')
    .insert({
      client_id: client.id,
      report_type: 'monthly',
      report_period_start: reportPeriodStart.toISOString().split('T')[0],
      report_period_end: new Date().toISOString().split('T')[0],
      metrics: {
        status: 'generated',
        generated_at: new Date().toISOString(),
      },
      insights: { summary: reportContent },
      recommendations: { content: reportContent },
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving report:', error);
    return { success: false, error: error.message };
  }

  // Create deliverable for client to review
  await supabase.from('deliverables').insert({
    client_account_id: client.id,
    title: `Monthly Performance Report - ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
    description: reportContent,
    category: 'report',
    status: 'pending_review',
  });

  return { success: true, reportId: data.id };
}

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
      ai_model_used: 'google/gemini-2.5-flash',
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
      tasksCompleted: 0,
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
      },
      weekly: {
        processAutomatedTasks: true,
        generateContent: true,
        runReports: false,
      },
      monthly: {
        processAutomatedTasks: true,
        generateContent: true,
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
              try {
                const taskResult = await processAutomatedTask(supabase, client, task);
                if (taskResult.success) {
                  results.tasksCompleted++;
                }
              } catch (taskError) {
                console.error(`Error processing task ${task.name}:`, taskError);
                results.errors.push(`Task "${task.name}" error: ${taskError}`);
              }
            }
          }
        }

        // 2. Generate content (weekly/monthly)
        if (config.generateContent) {
          const contentTypes = client.tier === 'foundation' 
            ? ['google_post']
            : client.tier === 'growth'
            ? ['google_post', 'social_post', 'email_newsletter']
            : ['google_post', 'social_post', 'email_newsletter', 'blog_post'];

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
            const reportResult = await generateReport(supabase, client);
            if (reportResult.success) {
              results.reportsCreated++;
            }
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
