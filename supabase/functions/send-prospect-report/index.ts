import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const APP_URL = Deno.env.get("APP_URL") || "https://orangedoormarketing.com";

let resend: Resend;

interface ScoredCategory { score: number; findings: string[]; recommendations: string[]; }

interface AnalysisSnapshot {
  overallScore: number;
  seo: ScoredCategory;
  conversion: ScoredCategory;
  technical: ScoredCategory;
  engagement?: ScoredCategory;
  metrics?: ScoredCategory;
  quickWins?: { title: string; description: string }[];
  summary?: string;
  detectedStrengths?: string[];
  detectedGaps?: string[];
}

interface ProspectData {
  name: string;
  email: string;
  website_url: string;
  gap_score: number | null;
  top_weaknesses: string[] | null;
  // Full analyze-website output -- see migration 20260819100203. Absent on
  // prospect rows created before that column existed; renderProspectPdf
  // falls back to a thinner report (just the headline score + weaknesses)
  // for those rather than crashing or showing fabricated zeros.
  analysis_snapshot: AnalysisSnapshot | null;
}

// --- Same status/priority mapping ReportConfig.ts uses for the web report and the
// server-rendered PDF, duplicated here since Deno edge functions can't import the
// site's TSX/React source. Keep in sync with src/components/report/ReportConfig.ts
// and src/pages/QuickAnalysis.tsx (buildCategoryScores/computeOverallScore) --
// this must produce the same numbers for the same scan. ---

function scoreToStatus(score: number): "Strong" | "Moderate" | "Weak" | "Critical" {
  if (score >= 70) return "Strong";
  if (score >= 50) return "Moderate";
  if (score >= 30) return "Weak";
  return "Critical";
}

function getTierLabel(score: number): string {
  if (score <= 39) return "Transformation";
  if (score <= 64) return "Growth";
  return "Optimization";
}

const LOCKED_SYSTEM_CATEGORIES = [
  { label: "Sequence & Nurture", reason: "Needs the full Gap Analysis — email/SMS follow-up setup isn't visible from a website scan." },
  { label: "Transaction Activation", reason: "Needs the full Gap Analysis — sales response time and close rate aren't visible from a website scan." },
];

// --- PDF: rendered server-side from the exact same <ReportView> component tree the
// web report and the manual "Download PDF" button use (api/render-report-pdf.ts),
// instead of the old hand-drawn pdf-lib PDF that had its own divergent layout/colors. ---

async function renderProspectPdf(prospect: ProspectData): Promise<Uint8Array> {
  const domain = prospect.website_url?.replace(/^https?:\/\//, "").replace(/\/$/, "") || "";
  const snapshot = prospect.analysis_snapshot;

  const reportData = snapshot
    ? (() => {
        const searchVisibilityScore = Math.round((snapshot.seo.score + snapshot.technical.score) / 2);
        const scored = [
          { label: "Search & Visibility", score: searchVisibilityScore, status: scoreToStatus(searchVisibilityScore) },
          { label: "Yield Optimization", score: snapshot.conversion.score, status: scoreToStatus(snapshot.conversion.score) },
          ...(snapshot.engagement ? [{ label: "Engagement & Retention", score: snapshot.engagement.score, status: scoreToStatus(snapshot.engagement.score) }] : []),
          ...(snapshot.metrics ? [{ label: "Metrics & Improvement", score: snapshot.metrics.score, status: scoreToStatus(snapshot.metrics.score) }] : []),
        ];
        const overallScore = Math.round(scored.reduce((sum, c) => sum + c.score, 0) / scored.length);
        const gaps = snapshot.detectedGaps?.length
          ? snapshot.detectedGaps
          : [...snapshot.seo.recommendations.slice(0, 1), ...snapshot.conversion.recommendations.slice(0, 1), ...snapshot.technical.recommendations.slice(0, 1)];

        return {
          businessName: prospect.name || domain,
          clientDomain: domain,
          reportDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
          overallScore,
          executiveSummary: snapshot.summary,
          biggestOpportunity: snapshot.quickWins?.[0]?.title,
          categoryScores: [
            ...scored,
            ...LOCKED_SYSTEM_CATEGORIES.map((c) => ({ label: c.label, score: 0, status: "Critical" as const, locked: true, lockedReason: c.reason })),
          ],
          strengths: (snapshot.detectedStrengths?.length ? snapshot.detectedStrengths : snapshot.seo.findings).slice(0, 4),
          gaps: gaps.slice(0, 4),
          actions: (snapshot.quickWins ?? []).map((w) => ({ title: w.title, description: w.description, tag: "Quick Win" as const })),
        };
      })()
    : {
        // Legacy fallback for a prospect scanned before analysis_snapshot existed --
        // best-effort single headline number, no per-category breakdown to show.
        businessName: prospect.name || domain,
        clientDomain: domain,
        reportDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        overallScore: prospect.gap_score ?? 0,
        categoryScores: [] as { label: string; score: number; status: "Strong" | "Moderate" | "Weak" | "Critical" }[],
        strengths: [] as string[],
        gaps: prospect.top_weaknesses ?? [],
        actions: [] as { title: string; description: string; tag: "Quick Win" }[],
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
// multi-page rendered PDF (the old 4-page pdf-lib PDF was small enough to get away with it).
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

function buildEmailHtml(prospect: ProspectData): string {
  const firstName = prospect.name?.split(" ")[0] || "there";
  const domain = prospect.website_url?.replace(/^https?:\/\//, "").replace(/\/$/, "") || "";
  const score = prospect.gap_score;
  const tierLabel = score != null ? getTierLabel(score) : "Growth";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your Website Marketing Report</title></head>
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
      We just finished analyzing <strong style="color:#1A1410;">${domain}</strong>. Your full, personalized marketing
      check-up — score, findings, and a prioritized action plan — is ready${score != null ? `, and we'd recommend the <strong style="color:#1A1410;">${tierLabel}</strong> track based on where you're at` : ""}.
    </p>

    <!-- Attachment callout -->
    <div style="background:#FAF7F2;border:1px solid #F0EBE2;border-radius:12px;padding:18px 20px;margin-bottom:28px;">
      <table cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="width:44px;">
          <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#E8521A,#F97316);text-align:center;line-height:40px;font-size:18px;">📄</div>
        </td>
        <td style="padding-left:14px;">
          <div style="font-size:14px;font-weight:600;color:#1A1410;">Website-Marketing-Report.pdf</div>
          <div style="font-size:12px;color:#8A7A6D;margin-top:2px;">Your full report is attached to this email</div>
        </td>
      </tr></table>
    </div>

    <!-- Primary CTA -->
    <div style="text-align:center;margin:8px 0 28px;">
      <a href="${APP_URL}/schedule" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#E8521A,#F97316);color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;letter-spacing:0.5px;font-family:Georgia,'Times New Roman',serif;">Book My Free Strategy Call</a>
    </div>

    <p style="font-size:13px;color:#8A7A6D;line-height:1.7;text-align:center;margin:0;">
      We'll walk through your report together, answer any questions, and show you exactly how we'd close these
      gaps — no pressure, no obligation.
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

// ── Handler ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY is not configured");
    resend = new Resend(resendKey);

    const { prospectId } = await req.json();
    if (!prospectId) throw new Error("prospectId is required");

    const { data: prospect, error: fetchError } = await supabase
      .from("prospects")
      .select("*")
      .eq("id", prospectId)
      .single();

    if (fetchError || !prospect) throw new Error("Prospect not found");

    console.log(`Rendering report PDF for ${prospect.email}...`);

    const pdfBytes = await renderProspectPdf(prospect as ProspectData);
    const pdfBase64 = uint8ToBase64(pdfBytes);
    console.log(`PDF rendered: ${pdfBytes.length} bytes`);

    const html = buildEmailHtml(prospect as ProspectData);

    const emailResponse = await resend.emails.send({
      from: Deno.env.get("EMAIL_FROM") || "Orange Door Consultants <hello@orangedoormarketing.com>",
      to: [prospect.email],
      subject: `Your free marketing report for ${prospect.website_url}`,
      html,
      attachments: [
        {
          filename: "Website-Marketing-Report.pdf",
          content: pdfBase64,
        },
      ],
    });

    console.log(`Report sent to ${prospect.email}:`, emailResponse);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-prospect-report error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
