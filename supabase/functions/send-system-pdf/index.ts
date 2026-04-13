import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PdfRequest {
  email: string;
  firstName?: string;
}

async function generateSystemPDF(): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  const orange = rgb(0.976, 0.451, 0.086); // #F97316
  const darkGray = rgb(0.1, 0.1, 0.1);
  const mediumGray = rgb(0.4, 0.4, 0.4);
  const lightOrange = rgb(1, 0.97, 0.93);
  
  // Page 1 - Cover
  const page1 = pdfDoc.addPage([612, 792]);
  const { width, height } = page1.getSize();
  
  // Orange header bar
  page1.drawRectangle({ x: 0, y: height - 120, width, height: 120, color: orange });
  
  // Title
  page1.drawText("THE SYSTEM", {
    x: 50, y: height - 80,
    size: 42, font: helveticaBold, color: rgb(1, 1, 1)
  });
  page1.drawText("METHODOLOGY", {
    x: 50, y: height - 110,
    size: 18, font: helvetica, color: rgb(1, 1, 1)
  });
  
  // Subtitle
  page1.drawText("A 6-Step Framework for Building Your", {
    x: 50, y: height - 180,
    size: 20, font: helvetica, color: darkGray
  });
  page1.drawText("Complete Digital Marketing Engine", {
    x: 50, y: height - 205,
    size: 20, font: helveticaBold, color: orange
  });
  
  // Intro paragraph
  const intro = "Stop guessing. Stop wasting money on random tactics. The SYSTEM methodology brings a proven framework that transforms your digital presence into a predictable growth engine.";
  const introLines = wrapText(intro, 70);
  introLines.forEach((line, i) => {
    page1.drawText(line, {
      x: 50, y: height - 260 - (i * 20),
      size: 12, font: helvetica, color: mediumGray
    });
  });
  
  // SYSTEM acronym
  const systemSteps = [
    { letter: "S", title: "Search & Visibility", desc: "Get found by the right people at the right time" },
    { letter: "Y", title: "Yield Optimization", desc: "Convert visitors into qualified leads" },
    { letter: "S", title: "Sequence & Nurture", desc: "Build relationships through automated follow-up" },
    { letter: "T", title: "Transaction Activation", desc: "Enable your sales team to close more deals" },
    { letter: "E", title: "Engagement & Retention", desc: "Turn customers into repeat buyers and advocates" },
    { letter: "M", title: "Metrics & Improvement", desc: "Measure, analyze, and continuously improve" },
  ];
  
  let yPos = height - 380;
  systemSteps.forEach((step) => {
    // Letter circle
    page1.drawCircle({ x: 70, y: yPos + 8, size: 18, color: orange });
    page1.drawText(step.letter, {
      x: 64, y: yPos,
      size: 16, font: helveticaBold, color: rgb(1, 1, 1)
    });
    
    // Title and description
    page1.drawText(step.title, {
      x: 100, y: yPos + 5,
      size: 14, font: helveticaBold, color: darkGray
    });
    page1.drawText(step.desc, {
      x: 100, y: yPos - 12,
      size: 10, font: helvetica, color: mediumGray
    });
    
    yPos -= 55;
  });
  
  // Footer
  page1.drawText("Orange Door Consultants | East Tennessee", {
    x: 50, y: 40,
    size: 10, font: helvetica, color: mediumGray
  });
  page1.drawText("orangedoormarketing.com", {
    x: width - 150, y: 40,
    size: 10, font: helvetica, color: orange
  });
  
  // Page 2 - Details
  const page2 = pdfDoc.addPage([612, 792]);
  
  // Header
  page2.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: orange });
  page2.drawText("THE SYSTEM IN DETAIL", {
    x: 50, y: height - 40,
    size: 24, font: helveticaBold, color: rgb(1, 1, 1)
  });
  
  const details = [
    {
      title: "1. Search & Visibility",
      points: [
        "SEO optimization for local and organic search",
        "Google Business Profile management",
        "Content strategy that attracts your ideal customers",
        "Paid advertising for immediate visibility"
      ]
    },
    {
      title: "2. Yield Optimization",
      points: [
        "Website conversion rate optimization",
        "Landing page design and testing",
        "Clear calls-to-action throughout",
        "Mobile-first user experience"
      ]
    },
    {
      title: "3. Sequence & Nurture",
      points: [
        "Email marketing automation",
        "Lead nurturing sequences",
        "Segmentation for personalized messaging",
        "SMS and multi-channel follow-up"
      ]
    },
    {
      title: "4. Transaction Activation",
      points: [
        "CRM setup and optimization",
        "Sales enablement tools",
        "Quote and proposal automation",
        "Pipeline management"
      ]
    },
    {
      title: "5. Engagement & Retention",
      points: [
        "Customer loyalty programs",
        "Review generation systems",
        "Referral programs",
        "Post-purchase follow-up"
      ]
    },
    {
      title: "6. Metrics & Improvement",
      points: [
        "KPI dashboards and reporting",
        "A/B testing and optimization",
        "ROI tracking and attribution",
        "Continuous improvement cycles"
      ]
    }
  ];
  
  yPos = height - 100;
  details.forEach((section, idx) => {
    if (idx === 3) {
      // Move to right column
      yPos = height - 100;
    }
    
    const xOffset = idx < 3 ? 50 : 320;
    
    page2.drawText(section.title, {
      x: xOffset, y: yPos,
      size: 12, font: helveticaBold, color: orange
    });
    
    yPos -= 18;
    section.points.forEach((point) => {
      page2.drawText("• " + point, {
        x: xOffset + 10, y: yPos,
        size: 9, font: helvetica, color: darkGray
      });
      yPos -= 14;
    });
    yPos -= 15;
  });
  
  // CTA box
  page2.drawRectangle({ x: 50, y: 80, width: width - 100, height: 80, color: lightOrange });
  page2.drawText("Ready to build your complete digital marketing engine?", {
    x: 70, y: 130,
    size: 14, font: helveticaBold, color: darkGray
  });
  page2.drawText("Take our free Gap Analysis to get your personalized SYSTEM Scorecard.", {
    x: 70, y: 110,
    size: 11, font: helvetica, color: mediumGray
  });
  page2.drawText("Visit: orangedoormarketing.com/gap-analysis", {
    x: 70, y: 90,
    size: 11, font: helveticaBold, color: orange
  });
  
  // Footer
  page2.drawText("Orange Door Consultants | East Tennessee", {
    x: 50, y: 40,
    size: 10, font: helvetica, color: mediumGray
  });
  
  return await pdfDoc.save();
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  words.forEach(word => {
    if ((currentLine + ' ' + word).length <= maxChars) {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });
  if (currentLine) lines.push(currentLine);
  
  return lines;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, firstName }: PdfRequest = await req.json();
    
    console.log("Received PDF request for:", email);

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store the lead in the database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: dbError } = await supabase
      .from("pdf_leads")
      .insert({ email, first_name: firstName, source: "system_brochure" });

    if (dbError) {
      console.error("Database error:", dbError);
    }

    // Generate PDF
    console.log("Generating SYSTEM PDF...");
    const pdfBytes = await generateSystemPDF();
    const pdfBase64 = btoa(String.fromCharCode(...pdfBytes));
    console.log("PDF generated, size:", pdfBytes.length, "bytes");

    // Send email with PDF attachment
    const emailResponse = await resend.emails.send({
      from: "Orange Door Consultants <hello@orangedoormarketing.com>",
      to: [email],
      subject: "Your SYSTEM Methodology Brochure is Ready!",
      attachments: [
        {
          filename: "SYSTEM-Methodology-Brochure.pdf",
          content: pdfBase64,
        },
      ],
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="background: linear-gradient(135deg, #f97316, #ea580c); width: 60px; height: 60px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
              <span style="color: white; font-weight: bold; font-size: 28px;">O</span>
            </div>
            <h1 style="color: #1a1a1a; margin: 0; font-size: 24px;">Orange Door Consultants</h1>
          </div>

          <h2 style="color: #1a1a1a; margin-bottom: 16px;">Hi${firstName ? ` ${firstName}` : ''},</h2>
          
          <p style="margin-bottom: 24px;">
            Thank you for your interest in the <strong>SYSTEM Methodology</strong>! Your PDF brochure is attached to this email.
          </p>

          <div style="background: linear-gradient(135deg, #fff7ed, #ffedd5); border: 1px solid #fed7aa; border-radius: 12px; padding: 24px; margin-bottom: 24px; text-align: center;">
            <p style="color: #c2410c; margin: 0 0 8px 0; font-size: 14px;">📎 ATTACHMENT</p>
            <p style="color: #78350f; margin: 0; font-weight: 600;">SYSTEM-Methodology-Brochure.pdf</p>
          </div>

          <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <h3 style="color: #1a1a1a; margin: 0 0 12px 0;">The 6-Step SYSTEM Framework:</h3>
            <ul style="margin: 0; padding-left: 20px; color: #4a5568;">
              <li><strong>S</strong> - Search & Visibility</li>
              <li><strong>Y</strong> - Yield Optimization</li>
              <li><strong>S</strong> - Sequence & Nurture</li>
              <li><strong>T</strong> - Transaction Activation</li>
              <li><strong>E</strong> - Engagement & Retention</li>
              <li><strong>M</strong> - Metrics & Improvement</li>
            </ul>
          </div>

          <p style="margin-bottom: 24px;">
            Ready to see how your business measures up? Take our free <strong>Gap Analysis</strong> to get a personalized SYSTEM Scorecard and recommendations.
          </p>

          <div style="text-align: center; margin: 24px 0;">
            <a href="https://orangedoormarketing.com/gap-analysis" style="display: inline-block; background: linear-gradient(135deg, #f97316, #ea580c); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600;">
              Start Your Free Gap Analysis →
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;">

          <p style="color: #666; font-size: 14px; text-align: center;">
            Questions? Just reply to this email - we'd love to hear from you!
          </p>
          
          <p style="color: #666; font-size: 14px; text-align: center;">
            Best regards,<br>
            <strong>The Orange Door Team</strong>
          </p>
        </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-system-pdf function:", error);

    try {
      const _sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await _sb.from('automation_alerts').insert({
        alert_type: 'function_error',
        severity: 'error',
        title: `Error in send-system-pdf`,
        message: error instanceof Error ? error.message : 'Unknown error',
        source: 'send-system-pdf',
        metadata: {
          function_name: 'send-system-pdf',
          client_id: null,
          error_message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (_alertErr) { console.error('Failed to log alert:', _alertErr); }
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
