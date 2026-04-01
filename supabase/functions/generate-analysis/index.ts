import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

      // Skip if already generated
      if (row.ai_analysis) {
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("AI service not configured");
    }

    console.log("Generating analysis for:", gapAnalysis.business_name);

    const systemPrompt = `You are a digital marketing consultant for Orange Door, an East Tennessee SMB marketing consultancy. 
Your task is to analyze a gap analysis submission and provide:
1. An executive summary (2-3 paragraphs) of the business's current digital marketing state
2. Key strengths identified
3. Critical gaps that need addressing
4. Top 3 priority recommendations

Use the SYSTEM framework:
- S: Search & Visibility (SEO, local presence, discoverability)
- Y: Yield Optimization (website conversion, messaging, CTAs)
- S: Sequence & Nurture (email automation, SMS, CRM, follow-ups)
- T: Transaction Activation (sales process, response time, closing)
- E: Engagement & Retention (reviews, loyalty, referrals, repeat business)
- M: Metrics & Improvement (analytics, tracking, KPIs, reporting)

Be specific, actionable, and use a professional but friendly tone appropriate for small business owners.
Format the response as JSON with keys: executiveSummary, strengths (array), gaps (array), recommendations (array of {title, description, priority})`;

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error("AI generation failed");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    console.log("AI response received");

    let analysis;
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      analysis = JSON.parse(jsonStr.trim());
    } catch (_parseError) {
      console.error("Failed to parse AI response as JSON:", _parseError);
      analysis = {
        executiveSummary: content,
        strengths: [],
        gaps: [],
        recommendations: [],
      };
    }

    // If called with submission_id, save the result back to the row
    if (body.submission_id) {
      const { error: updateErr } = await supabase
        .from("gap_analysis_submissions")
        .update({ ai_analysis: analysis, status: "completed" })
        .eq("id", body.submission_id);

      if (updateErr) {
        console.error("Failed to save analysis to submission:", updateErr);
      }

      // Also trigger the report email server-side
      const { data: sub } = await supabase
        .from("gap_analysis_submissions")
        .select("email, first_name, business_name, resume_token")
        .eq("id", body.submission_id)
        .single();

      if (sub?.email) {
        const baseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        fetch(`${baseUrl}/functions/v1/send-gap-report`, {
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
        }).catch((e) => console.error("Failed to send gap report email:", e));
      }
    }

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-analysis error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
