import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/http.ts";
import { callAI, extractJson, AIError } from "../_shared/ai.ts";
import { checkAdminAuth } from "../_shared/auth.ts";
import { auditWebsite } from "../_shared/websiteAudit.ts";

// deno-lint-ignore no-explicit-any
async function ensureReadinessScore(
  supabase: any,
  submissionId: string,
  websiteUrl: string | null | undefined,
): Promise<void> {
  if (!websiteUrl) return;
  const { data: existing } = await supabase
    .from("ai_readiness_scores")
    .select("id")
    .eq("submission_id", submissionId)
    .maybeSingle();
  if (existing) return;

  const audit = await auditWebsite(websiteUrl);
  if (!audit) return;

  const { error } = await supabase
    .from("ai_readiness_scores")
    .upsert({ submission_id: submissionId, ...audit.readiness }, { onConflict: "submission_id" });
  if (error) console.error("AI readiness score insert error:", error);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();

    const auth = await checkAdminAuth(req, supabase, body.password);
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let gapAnalysis: Record<string, unknown>;

    // Support new server-side path: { submission_id }
    if (body.submission_id) {
      const { data: row, error: fetchErr } = await supabase
        .from("gap_analysis_submissions")
        .select("*")
        .eq("id", body.submission_id)
        .single();

      if (fetchErr || !row) {
        return new Response(
          JSON.stringify({ error: "Submission not found", details: fetchErr?.message }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Skip if already generated — but check if context_profile needs extraction
      if (row.ai_analysis) {
        if (!row.context_profile) {
          try {
            const cachedGap = row as Record<string, unknown>;
            const rawGoals = cachedGap.top_business_goals;
            const primaryGoals: string[] = Array.isArray(rawGoals) ? rawGoals : (typeof rawGoals === 'string' && rawGoals ? [rawGoals] : []);
            const rawDiff = cachedGap.unique_differentiator;
            const differentiators: string[] = typeof rawDiff === 'string' && rawDiff.trim() ? [rawDiff.trim()] : [];
            const rawFrustration = cachedGap.biggest_marketing_frustration;
            const painPoints: string[] = typeof rawFrustration === 'string' && rawFrustration.trim() ? [rawFrustration.trim()] : [];
            const cachedCtx = {
              services: [],
              primary_goals: primaryGoals,
              differentiators,
              pain_points: painPoints,
              target_audience: typeof cachedGap.primary_customer_sources === 'string' ? cachedGap.primary_customer_sources : '',
              success_criteria: typeof cachedGap.what_makes_it_worth_it === 'string' ? cachedGap.what_makes_it_worth_it : '',
              urgency: typeof cachedGap.fastest_impact === 'string' ? cachedGap.fastest_impact : '',
              fears: typeof cachedGap.biggest_agency_fear === 'string' ? cachedGap.biggest_agency_fear : '',
              business_summary: `${cachedGap.business_name || 'A local business'} focused on ${primaryGoals.join(', ') || 'growing their customer base'}.`,
              partial: true,
              source: 'gap_form',
            };
            await supabase.from("gap_analysis_submissions").update({ context_profile: cachedCtx }).eq("id", body.submission_id);

            // Also upsert to prospects
            const cachedEmail = typeof cachedGap.email === 'string' ? cachedGap.email : '';
            if (cachedEmail) {
              const { data: ep } = await supabase.from("prospects").select("id, context_profile").eq("email", cachedEmail).maybeSingle();
              if (ep) {
                const merged = { ...(ep.context_profile || {}), ...cachedCtx, services: (ep.context_profile as any)?.services?.length > 0 ? (ep.context_profile as any).services : [] };
                await supabase.from("prospects").update({ context_profile: merged, submission_id: body.submission_id }).eq("id", ep.id);
              }
            }
          } catch (ctxCacheErr) {
            console.error("Context extraction on cached path failed:", ctxCacheErr);
          }
        }
        await ensureReadinessScore(supabase, body.submission_id, row.website_url as string | null);
        return new Response(
          JSON.stringify({ analysis: row.ai_analysis, cached: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      gapAnalysis = row;
    } else if (body.gapAnalysis) {
      // Legacy frontend path (kept for backward compat)
      gapAnalysis = body.gapAnalysis;
    } else {
      return new Response(
        JSON.stringify({ error: "submission_id or gapAnalysis required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Generating analysis for:", gapAnalysis.business_name);

    const systemPrompt = `You are a digital marketing consultant for Orange Door, an East Tennessee SMB marketing consultancy. 
Your task is to analyze a gap analysis submission and provide:
1. An executive summary (2-3 paragraphs) of the business's current digital marketing state
2. Key strengths identified
3. Critical gaps that need addressing
4. Top 3 priority recommendations
5. A plain English summary written for non-technical small business owners

Use the SYSTEM framework:
- S: Search & Visibility (SEO, local presence, discoverability)
- Y: Yield Optimization (website conversion, messaging, CTAs)
- S: Sequence & Nurture (email automation, SMS, CRM, follow-ups)
- T: Transaction Activation (sales process, response time, closing)
- E: Engagement & Retention (reviews, loyalty, referrals, repeat business)
- M: Metrics & Improvement (analytics, tracking, KPIs, reporting)

Be specific, actionable, and use a professional but friendly tone appropriate for small business owners.

Also return a field called plain_english_summary with this exact structure:
{
  "plain_english_summary": {
    "headline": "One sentence — the single most important thing wrong with their marketing. Write it like you are telling a friend, not writing a report. Example: 'Your website is almost invisible on Google and doesn't clearly explain what you do or how to contact you.'",
    "what_this_means": "2-3 sentences explaining what their score means for their business in plain terms. No jargon. No acronyms. Talk about customers, leads, and revenue — not CTR, bounce rate, or schema markup.",
    "top_priority": "One sentence — the single most important thing they should fix first and why it will make a difference.",
    "biggest_opportunity": "One sentence — the one thing that would have the biggest impact if fixed.",
    "what_is_working": "One sentence — something genuinely positive about their current marketing. Be honest — if nothing is working well, say their brand has potential."
  }
}

Format the response as JSON with keys: executiveSummary, strengths (array), gaps (array), recommendations (array of {title, description, priority}), plain_english_summary (object with headline, what_this_means, top_priority, biggest_opportunity, what_is_working)`;

    const userPrompt = `Analyze this gap analysis submission:

Business: ${gapAnalysis.business_name}
Contact: ${gapAnalysis.first_name} ${gapAnalysis.last_name}
Website: ${gapAnalysis.website_url || 'Not provided'}

BUSINESS FUNDAMENTALS:
- Top Goals: ${gapAnalysis.top_business_goals || 'Not specified'}
- Growth Satisfaction: ${gapAnalysis.growth_satisfaction || 'N/A'}/10
- Primary Customer Sources: ${gapAnalysis.primary_customer_sources || 'Not specified'}
- Competitors: ${gapAnalysis.top_competitors || 'Not specified'}
- Differentiator: ${gapAnalysis.unique_differentiator || 'Not specified'}
- Has Seasonality: ${gapAnalysis.has_seasonality ? 'Yes - ' + gapAnalysis.seasonality_details : 'No'}
- Avg Customer Lifetime Value: ${gapAnalysis.avg_customer_lifetime_value || 'Unknown'}

WEBSITE & CONVERSION:
- Last Updated: ${gapAnalysis.website_last_updated || 'Unknown'}
- Tracks Conversions: ${gapAnalysis.tracks_website_conversions ? 'Yes' : 'No'}
- Monthly Website Leads: ${gapAnalysis.monthly_website_leads || 'Unknown'}
- Priority Improvement: ${gapAnalysis.priority_improvement || 'Not specified'}

SEO & VISIBILITY:
- Investing in SEO: ${gapAnalysis.investing_in_seo ? 'Yes' : 'No'}
- Ranking for Keywords: ${gapAnalysis.ranking_for_keywords ? 'Yes' : 'No'}
- Monthly Organic Traffic: ${gapAnalysis.monthly_organic_traffic || 'Unknown'}
- Tracking Rankings: ${gapAnalysis.tracking_keyword_rankings ? 'Yes' : 'No'}

PAID ADVERTISING:
- Running Paid Ads: ${gapAnalysis.running_paid_ads ? 'Yes' : 'No'}
- Platforms: ${gapAnalysis.ad_platforms || 'None'}
- Monthly Ad Spend: ${gapAnalysis.monthly_ad_spend || 'None'}
- Cost Per Lead: ${gapAnalysis.cost_per_lead || 'Unknown'}
- Satisfied with Performance: ${gapAnalysis.satisfied_with_ad_performance ? 'Yes' : 'No'}
- Uses Retargeting: ${gapAnalysis.runs_retargeting ? 'Yes' : 'No'}
- Uses Landing Pages: ${gapAnalysis.ads_use_landing_pages ? 'Yes' : 'No'}

LEAD NURTURE:
- Email Automation: ${gapAnalysis.uses_email_automation ? 'Yes' : 'No'}
- SMS Follow-ups: ${gapAnalysis.uses_sms_followups ? 'Yes' : 'No'}
- Has CRM: ${gapAnalysis.has_crm ? 'Yes - ' + (gapAnalysis.crm_name || 'Unknown') : 'No'}
- CRM Tracks All Inbound: ${gapAnalysis.crm_tracks_all_inbound ? 'Yes' : 'No'}
- Has Drip Campaigns: ${gapAnalysis.has_segmentation_drip ? 'Yes' : 'No'}
- Abandoned Follow-ups: ${gapAnalysis.has_abandoned_followups ? 'Yes' : 'No'}

SALES ENABLEMENT:
- Response Time: ${gapAnalysis.lead_response_time || 'Unknown'}
- Close Rate: ${gapAnalysis.close_rate || 'Unknown'}
- Online Scheduling: ${gapAnalysis.uses_online_scheduling ? 'Yes' : 'No'}
- Common Objections: ${gapAnalysis.common_objections || 'Not specified'}
- Where Prospects Lost: ${gapAnalysis.where_prospects_lost || 'Not specified'}

RETENTION & REPUTATION:
- Asks for Reviews: ${gapAnalysis.asks_for_reviews ? 'Yes' : 'No'}
- Monthly New Reviews: ${gapAnalysis.monthly_new_reviews || 'Unknown'}
- Has Reputation Tool: ${gapAnalysis.has_reputation_tool ? 'Yes' : 'No'}
- Emails Past Customers: ${gapAnalysis.emails_past_customers ? 'Yes' : 'No'}
- Repeat Customer Rate: ${gapAnalysis.repeat_customer_rate || 'Unknown'}
- Loyalty/Referral Program: ${gapAnalysis.has_loyalty_referral_program ? 'Yes' : 'No'}

ANALYTICS:
- Uses Google Analytics: ${gapAnalysis.uses_google_analytics ? 'Yes' : 'No'}
- Knows Best Lead Sources: ${gapAnalysis.knows_best_lead_sources ? 'Yes' : 'No'}
- KPIs Tracked: ${gapAnalysis.kpis_tracked || 'None specified'}
- Data Accuracy Confidence: ${gapAnalysis.data_accuracy_confidence || 'Unknown'}
- Does A/B Testing: ${gapAnalysis.does_ab_testing ? 'Yes' : 'No'}

INTERNAL CAPACITY:
- Who Handles Marketing: ${gapAnalysis.who_handles_marketing || 'Unknown'}
- Monthly Budget: ${gapAnalysis.monthly_marketing_budget || 'Unknown'}
- Weekly Team Hours: ${gapAnalysis.weekly_team_hours || 'Unknown'}
- Past Failures: ${gapAnalysis.past_marketing_failures || 'None mentioned'}

MINDSET:
- Biggest Frustration: ${gapAnalysis.biggest_marketing_frustration || 'Not specified'}
- Biggest Agency Fear: ${gapAnalysis.biggest_agency_fear || 'Not specified'}
- Fastest Impact Desired: ${gapAnalysis.fastest_impact || 'Not specified'}
- What Makes It Worth It: ${gapAnalysis.what_makes_it_worth_it || 'Not specified'}

Generate a comprehensive analysis in JSON format.`;

    let content: string;
    try {
      content = await callAI({
        source: "generate-analysis",
        system: systemPrompt,
        prompt: userPrompt,
        maxTokens: 4096,
        temperature: 0.7,
        jsonMode: true,
      });
    } catch (e) {
      if (e instanceof AIError && (e.status === 429 || e.status === 402)) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: e.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw e;
    }

    console.log("AI response received");

    let analysis;
    try {
      analysis = extractJson(content);
    } catch (_parseError) {
      console.error("Failed to parse AI response as JSON:", _parseError);
      analysis = {
        executiveSummary: content,
        strengths: [],
        gaps: [],
        recommendations: [],
      };
    }

    // --- Compute SYSTEM scores from raw form fields ---
    const computeSystemScores = (g: Record<string, unknown>) => {
      const bool = (v: unknown) => v === true || v === "true" || v === "yes";
      const num = (v: unknown, fallback = 0) => { const n = Number(v); return isNaN(n) ? fallback : n; };
      const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;

      // S — Search & Visibility (SEO, local presence)
      const sScore = [
        bool(g.investing_in_seo) ? 20 : 0,
        bool(g.ranking_for_keywords) ? 20 : 0,
        bool(g.tracking_keyword_rankings) ? 15 : 0,
        filled(g.monthly_organic_traffic) ? 15 : 0,
        filled(g.top_competitors) ? 10 : 0,
        bool(g.has_reputation_tool) ? 10 : 0,
        bool(g.asks_for_reviews) ? 10 : 0,
      ].reduce((a, b) => a + b, 0);

      // Y — Yield Optimization (website conversion)
      const yScore = [
        filled(g.website_url) ? 15 : 0,
        bool(g.tracks_website_conversions) ? 25 : 0,
        filled(g.monthly_website_leads) ? 15 : 0,
        filled(g.priority_improvement) ? 10 : 0,
        filled(g.website_last_updated) && g.website_last_updated !== "more_than_2_years" ? 15 : 0,
        bool(g.ads_use_landing_pages) ? 20 : 0,
      ].reduce((a, b) => a + b, 0);

      // S — Sequence & Nurture (email, CRM, follow-ups)
      const seqScore = [
        bool(g.uses_email_automation) ? 20 : 0,
        bool(g.uses_sms_followups) ? 15 : 0,
        bool(g.has_crm) ? 20 : 0,
        bool(g.crm_tracks_all_inbound) ? 15 : 0,
        bool(g.has_segmentation_drip) ? 15 : 0,
        bool(g.has_abandoned_followups) ? 15 : 0,
      ].reduce((a, b) => a + b, 0);

      // T — Transaction Activation (sales process)
      const tScore = [
        filled(g.lead_response_time) && g.lead_response_time !== "more_than_24_hours" ? 25 : 0,
        filled(g.close_rate) ? 15 : 0,
        bool(g.uses_online_scheduling) ? 20 : 0,
        filled(g.common_objections) ? 10 : 0,
        filled(g.where_prospects_lost) ? 10 : 0,
        num(g.growth_satisfaction) >= 7 ? 20 : num(g.growth_satisfaction) >= 4 ? 10 : 0,
      ].reduce((a, b) => a + b, 0);

      // E — Engagement & Retention
      const eScore = [
        bool(g.asks_for_reviews) ? 20 : 0,
        filled(g.monthly_new_reviews) ? 15 : 0,
        bool(g.emails_past_customers) ? 20 : 0,
        filled(g.repeat_customer_rate) ? 15 : 0,
        bool(g.has_loyalty_referral_program) ? 15 : 0,
        bool(g.has_reputation_tool) ? 15 : 0,
      ].reduce((a, b) => a + b, 0);

      // M — Metrics & Improvement
      const mScore = [
        bool(g.uses_google_analytics) ? 25 : 0,
        bool(g.knows_best_lead_sources) ? 20 : 0,
        filled(g.kpis_tracked) ? 15 : 0,
        filled(g.data_accuracy_confidence) ? 15 : 0,
        bool(g.does_ab_testing) ? 25 : 0,
      ].reduce((a, b) => a + b, 0);

      const breakdown = {
        search: Math.min(sScore, 100),
        yield: Math.min(yScore, 100),
        sequence: Math.min(seqScore, 100),
        transaction: Math.min(tScore, 100),
        engagement: Math.min(eScore, 100),
        metrics: Math.min(mScore, 100),
      };

      const overall = Math.round(
        Object.values(breakdown).reduce((a, b) => a + b, 0) / 6
      );

      return { overall, breakdown };
    };

    const systemScores = computeSystemScores(gapAnalysis);

    // If called with submission_id, save the result back to the row
    if (body.submission_id) {
      const { error: updateErr } = await supabase
        .from("gap_analysis_submissions")
        .update({
          ai_analysis: analysis,
          status: "completed",
          overall_score: systemScores.overall,
          score_breakdown: systemScores.breakdown,
        })
        .eq("id", body.submission_id);

      if (updateErr) {
        console.error("Failed to save analysis to submission:", updateErr);
      }

      await ensureReadinessScore(supabase, body.submission_id, gapAnalysis.website_url as string | null);

      // --- Context profile extraction (non-blocking) ---
      let contextProfile: Record<string, unknown> | null = null;
      try {
        const rawGoals = gapAnalysis.top_business_goals;
        const primaryGoals: string[] = Array.isArray(rawGoals) ? rawGoals : (typeof rawGoals === 'string' && rawGoals ? [rawGoals] : []);
        const rawDiff = gapAnalysis.unique_differentiator;
        const differentiators: string[] = typeof rawDiff === 'string' && (rawDiff as string).trim() ? [(rawDiff as string).trim()] : [];
        const rawFrustration = gapAnalysis.biggest_marketing_frustration;
        const painPoints: string[] = typeof rawFrustration === 'string' && (rawFrustration as string).trim() ? [(rawFrustration as string).trim()] : [];

        contextProfile = {
          services: [],
          primary_goals: primaryGoals,
          differentiators,
          pain_points: painPoints,
          target_audience: typeof gapAnalysis.primary_customer_sources === 'string' ? gapAnalysis.primary_customer_sources : '',
          success_criteria: typeof gapAnalysis.what_makes_it_worth_it === 'string' ? gapAnalysis.what_makes_it_worth_it : '',
          urgency: typeof gapAnalysis.fastest_impact === 'string' ? gapAnalysis.fastest_impact : '',
          fears: typeof gapAnalysis.biggest_agency_fear === 'string' ? gapAnalysis.biggest_agency_fear : '',
          business_summary: `${gapAnalysis.business_name || 'A local business'} focused on ${primaryGoals.join(', ') || 'growing their customer base'}.`,
          partial: !body.submission_id,
          source: 'gap_form',
        };

        await supabase
          .from("gap_analysis_submissions")
          .update({ context_profile: contextProfile })
          .eq("id", body.submission_id);
      } catch (ctxErr) {
        console.error("Failed to save context_profile to submission:", ctxErr);
      }

      // --- Upsert prospects row with context_profile (non-blocking) ---
      const { data: sub } = await supabase
        .from("gap_analysis_submissions")
        .select("email, first_name, last_name, business_name, resume_token")
        .eq("id", body.submission_id)
        .single();

      if (sub?.email && contextProfile) {
        try {
          const { data: existingProspect } = await supabase
            .from("prospects")
            .select("id, context_profile")
            .eq("email", sub.email)
            .maybeSingle();

          if (existingProspect) {
            const existingCtx = (existingProspect.context_profile || {}) as Record<string, unknown>;
            const mergedCtx = {
              ...existingCtx,
              ...contextProfile,
              services: Array.isArray(existingCtx.services) && (existingCtx.services as string[]).length > 0 ? existingCtx.services : [],
              source: 'gap_form',
            };
            await supabase
              .from("prospects")
              .update({ context_profile: mergedCtx, submission_id: body.submission_id })
              .eq("id", existingProspect.id);
          } else {
            await supabase
              .from("prospects")
              .insert({
                name: `${gapAnalysis.first_name || ''} ${gapAnalysis.last_name || ''}`.trim() || sub.email,
                email: sub.email,
                business_type: typeof gapAnalysis.industry === 'string' ? gapAnalysis.industry : null,
                website_url: typeof gapAnalysis.website_url === 'string' ? gapAnalysis.website_url as string : '',
                context_profile: contextProfile,
                submission_id: body.submission_id,
              });
          }
        } catch (prospectErr) {
          console.error("Failed to upsert prospects context:", prospectErr);
        }
      }

      // Sync context_profile to client_accounts if this email is an existing client
      if (sub?.email && contextProfile) {
        try {
          const { data: clientAccount } = await supabase
            .from("client_accounts")
            .select("id, context_profile")
            .ilike("email", sub.email)
            .maybeSingle();

          if (clientAccount) {
            const existingCtx = (clientAccount.context_profile || {}) as Record<string, unknown>;
            const mergedCtx = {
              ...existingCtx,
              ...contextProfile,
              source: 'gap_form',
            };
            await supabase
              .from("client_accounts")
              .update({ context_profile: mergedCtx, intake_completed_at: new Date().toISOString() })
              .eq("id", clientAccount.id);
            console.log(`Synced context_profile to client_accounts for ${sub.email}`);
          }
        } catch (clientSyncErr) {
          console.error("Failed to sync context_profile to client_accounts:", clientSyncErr);
        }
      }

      // Trigger report email
      if (sub?.email) {
        const baseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        try {
          const reportRes = await fetch(`${baseUrl}/functions/v1/send-gap-report`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              email: sub.email,
              firstName: sub.first_name,
              businessName: sub.business_name,
              resumeToken: sub.resume_token,
              analysis,
            }),
          });
          if (!reportRes.ok) {
            console.error("send-gap-report failed:", reportRes.status, await reportRes.text());
          }
        } catch (e) {
          console.error("Failed to send gap report email:", e);
        }
      }
    }

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-analysis error:", error);

    await supabase.from('automation_alerts').insert({
      alert_type: 'function_error',
      severity: 'error',
      title: `Error in generate-analysis`,
      message: error instanceof Error ? error.message : 'Unknown error',
      source: 'generate-analysis',
      metadata: {
        function_name: 'generate-analysis',
        client_id: null,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
