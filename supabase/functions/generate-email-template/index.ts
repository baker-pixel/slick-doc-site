import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateRequest {
  templateType: string;
  industry?: string;
  tone?: string;
  purpose?: string;
  clientName?: string;
  customInstructions?: string;
}

const TEMPLATE_TYPES: Record<string, { description: string; defaultPurpose: string }> = {
  welcome: {
    description: "Welcome email for new clients/leads",
    defaultPurpose: "Welcome a new client and set expectations for the partnership",
  },
  followup: {
    description: "Follow-up email after initial contact",
    defaultPurpose: "Follow up on a previous conversation or inquiry",
  },
  report: {
    description: "Marketing report or analysis delivery",
    defaultPurpose: "Deliver a marketing report with key insights and next steps",
  },
  promotion: {
    description: "Promotional or marketing campaign",
    defaultPurpose: "Promote services or special offers",
  },
  newsletter: {
    description: "Monthly newsletter or update",
    defaultPurpose: "Share monthly updates, tips, and industry news",
  },
  reminder: {
    description: "Appointment or deadline reminder",
    defaultPurpose: "Remind about upcoming meetings or deadlines",
  },
  reengagement: {
    description: "Re-engagement for inactive clients",
    defaultPurpose: "Re-engage with clients who haven't been active recently",
  },
  thankyou: {
    description: "Thank you or appreciation email",
    defaultPurpose: "Thank clients for their business or referrals",
  },
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { templateType, industry, tone, purpose, clientName, customInstructions }: GenerateRequest = await req.json();

    const templateInfo = TEMPLATE_TYPES[templateType] || TEMPLATE_TYPES.followup;
    const actualPurpose = purpose || templateInfo.defaultPurpose;
    const actualTone = tone || "professional yet friendly";
    const actualIndustry = industry || "small business";

    const systemPrompt = `You are an expert email marketing copywriter for Orange Door Marketing, a digital marketing agency. 
You create compelling, conversion-focused email templates that feel personal and authentic.

BRAND VOICE:
- Warm, approachable, and confident
- Results-focused without being pushy
- Uses "we" and "our" when referring to Orange Door Marketing
- Primary color: Orange (#F97316)
- Sign off as "The Orange Door Team" or "Your Orange Door Team"

OUTPUT REQUIREMENTS:
Return a JSON object with exactly these fields:
{
  "name": "Template name (concise, descriptive)",
  "slug": "template_slug_in_snake_case",
  "subject": "Email subject line with {{firstName}} variable if appropriate",
  "html_content": "Full HTML email content with proper styling",
  "description": "Brief description of when to use this template",
  "category": "One of: marketing, transactional, notification, onboarding, follow-up, sales, customer-success, engagement"
}

HTML REQUIREMENTS:
- Use inline styles (no external CSS)
- Maximum width: 600px, centered
- Use {{firstName}}, {{lastName}}, {{businessName}}, {{email}} as personalization variables
- Include a clear call-to-action button with orange (#F97316) background
- Include proper spacing and typography
- Make links use the full URL format (https://orangedoormarketing.com/...)
- Keep emails scannable with short paragraphs
- Mobile-friendly design`;

    const userPrompt = `Create a ${templateType} email template with the following requirements:

Purpose: ${actualPurpose}
Industry focus: ${actualIndustry}
Tone: ${actualTone}
${clientName ? `Example client name: ${clientName}` : ""}
${customInstructions ? `Additional instructions: ${customInstructions}` : ""}

Template type description: ${templateInfo.description}

Remember to return valid JSON with name, slug, subject, html_content, description, and category fields.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

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
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI gateway returned ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content received from AI");
    }

    // Parse the JSON response
    let templateData;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        templateData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse AI response as JSON");
    }

    // Validate required fields
    const requiredFields = ["name", "slug", "subject", "html_content", "description", "category"];
    for (const field of requiredFields) {
      if (!templateData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Extract variables from the HTML content
    const variableRegex = /\{\{(\w+)\}\}/g;
    const variables = new Set<string>();
    let match;
    while ((match = variableRegex.exec(templateData.html_content)) !== null) {
      variables.add(match[1]);
    }
    while ((match = variableRegex.exec(templateData.subject)) !== null) {
      variables.add(match[1]);
    }
    templateData.variables = Array.from(variables);

    console.log("Generated template:", templateData.name);

    return new Response(JSON.stringify({ success: true, template: templateData }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error generating template:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
