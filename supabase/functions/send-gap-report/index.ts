import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const APP_URL = Deno.env.get("APP_URL") || "https://orangedoormarketing.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScoreItem {
  label: string;
  score: number;
}

interface Recommendation {
  title: string;
  description: string;
  priority: string;
}

interface ReportEmailRequest {
  email: string;
  firstName: string;
  businessName: string;
  websiteUrl?: string;
  resumeToken?: string;
  scorecard?: {
    scores: ScoreItem[];
    overallScore: number;
  };
  analysis: {
    executiveSummary: string;
    strengths: string[];
    gaps: string[];
    recommendations: Recommendation[];
  };
}

// --- Same status/priority mapping ReportConfig.ts uses for the web report and the
// server-rendered PDF, duplicated here since Deno edge functions can't import the
// site's TSX/React source. Keep in sync with src/components/report/ReportConfig.ts. ---

function scoreToStatus(score: number): "Strong" | "Moderate" | "Weak" | "Critical" {
  if (score >= 70) return "Strong";
  if (score >= 50) return "Moderate";
  if (score >= 30) return "Weak";
  return "Critical";
}

function mapPriority(priority: string, index: number): "Quick Win" | "Medium Term" | "Long Term" {
  const p = (priority || "").toLowerCase();
  if (p.includes("high") || p.includes("quick") || p.includes("immediate") || p.includes("urgent")) return "Quick Win";
  if (p.includes("low") || p.includes("long")) return "Long Term";
  if (p.includes("medium") || p.includes("mid")) return "Medium Term";
  return index < 3 ? "Quick Win" : index < 6 ? "Medium Term" : "Long Term";
}

// --- PDF: rendered server-side from the exact same <ReportView> component tree the
// web report and the manual "Download PDF" button use (api/render-report-pdf.ts),
// instead of the old hand-drawn pdf-lib PDF that had its own divergent layout/colors. ---

async function renderGapReportPdf(body: ReportEmailRequest): Promise<Uint8Array> {
  const { businessName, websiteUrl, scorecard, analysis } = body;

  const reportData = {
    businessName,
    clientDomain: websiteUrl
      ? websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")
      : businessName,
    reportDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    overallScore: scorecard?.overallScore ?? 0,
    executiveSummary: analysis?.executiveSummary,
    biggestOpportunity: analysis?.recommendations?.[0]?.title,
    categoryScores: (scorecard?.scores ?? []).map((s) => ({
      label: s.label,
      score: s.score,
      status: scoreToStatus(s.score),
    })),
    strengths: analysis?.strengths ?? [],
    gaps: analysis?.gaps ?? [],
    actions: (analysis?.recommendations ?? []).map((r, i) => ({
      title: r.title,
      description: r.description,
      tag: mapPriority(r.priority, i),
    })),
  };

  const res = await fetch(`${APP_URL}/api/render-report-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reportData),
  });
  if (!res.ok) {
    throw new Error(`render-report-pdf failed: ${res.status} ${await res.text()}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

// Chunked to avoid blowing the call stack with String.fromCharCode(...bytes) on a
// multi-page rendered PDF (the old 3-page pdf-lib PDF was small enough to get away with it).
function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// --- Email: a short, aesthetic transactional email that points to the attached PDF
// instead of re-rendering the report inline. ---

function buildEmailHtml(params: ReportEmailRequest): string {
  const { firstName, businessName, resumeToken } = params;
  const dashboardUrl = resumeToken ? `${APP_URL}/dashboard/${resumeToken}` : null;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your SYSTEM Gap Report</title></head>
<body style="margin:0;padding:0;background:#F0EBE2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(26,20,16,0.08);">

  <!-- Top accent bar -->
  <div style="height:4px;background:linear-gradient(90deg,#E8521A,#F97316);"></div>

  <!-- Header -->
  <div style="background:#1A1410;padding:32px 40px;">
    <div style="color:#E8521A;font-weight:bold;font-size:13px;letter-spacing:2.5px;margin-bottom:2px;">ORANGE DOOR</div>
    <div style="color:#8A7A6D;font-size:10px;letter-spacing:1.5px;">DIGITAL MARKETING</div>
  </div>

  <!-- Body -->
  <div style="padding:40px;">
    <p style="font-size:18px;color:#1A1410;margin:0 0 16px;font-weight:600;">Hi ${firstName}, this is Orange Door 👋</p>
    <p style="font-size:15px;color:#5B4C42;line-height:1.7;margin:0 0 24px;">
      Thanks for completing your SYSTEM Gap Analysis. We've put together a full, personalized breakdown of
      <strong style="color:#1A1410;">${businessName}</strong>'s marketing — your score, what's working, and exactly
      where the biggest opportunities are.
    </p>

    <!-- Attachment callout -->
    <div style="display:flex;align-items:center;gap:14px;background:#FAF7F2;border:1px solid #F0EBE2;border-radius:12px;padding:18px 20px;margin-bottom:28px;">
      <table cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="width:44px;">
          <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#E8521A,#F97316);text-align:center;line-height:40px;font-size:18px;">📄</div>
        </td>
        <td style="padding-left:14px;">
          <div style="font-size:14px;font-weight:600;color:#1A1410;">SYSTEM-Gap-Report.pdf</div>
          <div style="font-size:12px;color:#8A7A6D;margin-top:2px;">Your full report is attached to this email</div>
        </td>
      </tr></table>
    </div>

    ${dashboardUrl ? `
    <div style="background:#1A1410;border-radius:12px;padding:24px;margin-bottom:24px;text-align:center;">
      <p style="color:#FAF7F2;font-size:16px;font-weight:600;margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;">Your Personal Dashboard</p>
      <p style="color:#8A7A6D;font-size:13px;margin:0 0 16px;">Track your SYSTEM score and progress anytime, from anywhere.</p>
      <a href="${dashboardUrl}" style="display:inline-block;background:linear-gradient(135deg,#E8521A,#F97316);color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">View Your Dashboard →</a>
    </div>
    ` : ""}

    <!-- Primary CTA -->
    <div style="text-align:center;margin:8px 0 28px;">
      <a href="${APP_URL}/schedule" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#E8521A,#F97316);color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;letter-spacing:0.5px;font-family:Georgia,'Times New Roman',serif;">Book a Free Strategy Call</a>
    </div>

    <p style="font-size:13px;color:#8A7A6D;line-height:1.7;text-align:center;margin:0;">
      We'll walk you through your report, answer any questions, and show you exactly how we'd close these gaps —
      no obligation, no sales pressure.
    </p>

    <div style="border-top:1px solid #F0EBE2;margin-top:32px;padding-top:24px;">
      <p style="font-size:14px;color:#5B4C42;margin:0;">
        Talk soon,<br><strong style="color:#1A1410;">The Orange Door Team</strong>
      </p>
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#FAF7F2;padding:20px 40px;text-align:center;font-size:11px;color:#A0968C;border-top:1px solid #F0EBE2;">
    Orange Door Consulting · AI-Powered Marketing for Local Businesses
  </div>
</div>
</body></html>`;
}

// --- Handler ---

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const _sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body: ReportEmailRequest = await req.json();
    const { email, businessName } = body;

    console.log("Sending gap report to:", email);

    console.log("Rendering gap report PDF via /api/render-report-pdf...");
    const pdfBytes = await renderGapReportPdf(body);
    const pdfBase64 = uint8ToBase64(pdfBytes);
    console.log("PDF rendered, size:", pdfBytes.length, "bytes");

    const emailHtml = buildEmailHtml(body);

    const emailResponse = await resend.emails.send({
      from: "Orange Door Consultants <hello@orangedoormarketing.com>",
      to: [email],
      subject: `Your SYSTEM Gap Report for ${businessName}`,
      html: emailHtml,
      attachments: [
        {
          filename: "SYSTEM-Gap-Report.pdf",
          content: pdfBase64,
        },
      ],
    });

    console.log("Report email sent:", emailResponse);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error sending gap report:", error);

    try {
      await _sb.from("automation_alerts").insert({
        alert_type: "function_error",
        severity: "error",
        title: "Error in send-gap-report",
        message: error instanceof Error ? error.message : "Unknown error",
        source: "send-gap-report",
        metadata: {
          function_name: "send-gap-report",
          client_id: null,
          error_message: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        },
      });
    } catch (_alertErr) {
      console.error("Failed to log alert:", _alertErr);
    }
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
};

serve(handler);
