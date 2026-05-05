import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScoreItem {
  category: string;
  label: string;
  score: number;
  status: string;
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
  resumeToken?: string;
  scorecard?: {
    scores: ScoreItem[];
    overallScore: number;
    overallStatus: string;
  };
  analysis: {
    executiveSummary: string;
    strengths: string[];
    gaps: string[];
    recommendations: Recommendation[];
  };
}

// --- PDF Generation ---

const ORANGE = rgb(0.976, 0.451, 0.086);
const DARK_ORANGE = rgb(0.918, 0.349, 0.047);
const WHITE = rgb(1, 1, 1);
const DARK_TEXT = rgb(0.1, 0.1, 0.1);
const MED_GRAY = rgb(0.4, 0.4, 0.4);
const LIGHT_ORANGE_BG = rgb(1, 0.97, 0.93);
const LIGHT_GRAY_BG = rgb(0.96, 0.96, 0.96);
const GREEN = rgb(0.063, 0.725, 0.506);
const YELLOW = rgb(0.918, 0.702, 0.031);
const RED = rgb(0.937, 0.267, 0.267);

function scoreColor(score: number) {
  if (score >= 70) return GREEN;
  if (score >= 50) return YELLOW;
  if (score >= 30) return ORANGE;
  return RED;
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).length <= maxChars) {
      cur = cur ? cur + " " + w : w;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawFooter(
  page: ReturnType<typeof PDFDocument.prototype.addPage>,
  width: number,
  helvetica: any,
  pageNum: number,
  totalPages: number,
) {
  page.drawRectangle({ x: 0, y: 0, width, height: 40, color: LIGHT_GRAY_BG });
  page.drawText("Orange Door Consultants", {
    x: 50, y: 15, size: 9, font: helvetica, color: MED_GRAY,
  });
  page.drawText("orangedoormarketing.com", {
    x: width - 160, y: 15, size: 9, font: helvetica, color: ORANGE,
  });
  const pn = `${pageNum} / ${totalPages}`;
  const pnW = helvetica.widthOfTextAtSize(pn, 8);
  page.drawText(pn, { x: (width - pnW) / 2, y: 15, size: 8, font: helvetica, color: MED_GRAY });
}

interface PdfParams {
  firstName: string;
  businessName: string;
  scorecard?: ReportEmailRequest["scorecard"];
  analysis: ReportEmailRequest["analysis"];
}

async function generateGapReportPDF(params: PdfParams): Promise<Uint8Array> {
  const { firstName, businessName, scorecard, analysis } = params;
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const W = 612;
  const H = 792;
  const totalPages = 3;

  // ===== PAGE 1 — Cover =====
  const p1 = doc.addPage([W, H]);

  // Header bar
  p1.drawRectangle({ x: 0, y: H - 130, width: W, height: 130, color: ORANGE });
  p1.drawText("SYSTEM GAP REPORT", { x: 50, y: H - 70, size: 36, font: bold, color: WHITE });
  p1.drawText(`Prepared for ${businessName}`, { x: 50, y: H - 100, size: 14, font: reg, color: WHITE });

  // Greeting
  let y = H - 180;
  p1.drawText(`Hi ${firstName},`, { x: 50, y, size: 14, font: bold, color: DARK_TEXT });
  y -= 24;
  const introLines = wrapText(
    "Thank you for completing the Orange Door Gap Analysis. Below is your personalized SYSTEM health assessment — a snapshot of where your marketing stands today and where the biggest opportunities lie.",
    90,
  );
  for (const line of introLines) {
    p1.drawText(line, { x: 50, y, size: 12, font: reg, color: MED_GRAY });
    y -= 18;
  }

  // Score circle
  if (scorecard) {
    const cx = W / 2;
    const cy = y - 80;
    p1.drawCircle({ x: cx, y: cy, size: 60, color: ORANGE });
    const scoreTxt = String(scorecard.overallScore);
    const scoreW = bold.widthOfTextAtSize(scoreTxt, 32);
    p1.drawText(scoreTxt, { x: cx - scoreW / 2, y: cy - 12, size: 32, font: bold, color: WHITE });
    const statusW = reg.widthOfTextAtSize(scorecard.overallStatus, 12);
    p1.drawText(scorecard.overallStatus, { x: cx - statusW / 2, y: cy - 80, size: 12, font: reg, color: MED_GRAY });
  }

  drawFooter(p1, W, reg, 1, totalPages);

  // ===== PAGE 2 — Scorecard =====
  const p2 = doc.addPage([W, H]);
  p2.drawRectangle({ x: 0, y: H - 80, width: W, height: 80, color: ORANGE });
  p2.drawText("SYSTEM SCORECARD", { x: 50, y: H - 55, size: 28, font: bold, color: WHITE });

  const scores = scorecard?.scores ?? [];
  let rowY = H - 130;
  const rowH = 60;
  const barMaxW = 260;

  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    const bgColor = i % 2 === 0 ? WHITE : LIGHT_GRAY_BG;
    p2.drawRectangle({ x: 0, y: rowY - rowH, width: W, height: rowH, color: bgColor });

    // Letter badge
    const badgeCx = 45;
    const badgeCy = rowY - rowH / 2;
    p2.drawCircle({ x: badgeCx, y: badgeCy, size: 16, color: ORANGE });
    const letter = s.category.replace("S2", "S");
    const lw = bold.widthOfTextAtSize(letter, 14);
    p2.drawText(letter, { x: badgeCx - lw / 2, y: badgeCy - 5, size: 14, font: bold, color: WHITE });

    // Category name
    p2.drawText(s.label, { x: 75, y: rowY - 22, size: 12, font: bold, color: DARK_TEXT });

    // Status text
    const sc = scoreColor(s.score);
    p2.drawText(s.status, { x: 75, y: rowY - 38, size: 9, font: reg, color: sc });

    // Progress bar background
    const barX = 270;
    const barY = rowY - 34;
    p2.drawRectangle({ x: barX, y: barY, width: barMaxW, height: 8, color: LIGHT_GRAY_BG });
    // Progress bar fill
    const fillW = Math.max(4, (s.score / 100) * barMaxW);
    p2.drawRectangle({ x: barX, y: barY, width: fillW, height: 8, color: sc });

    // Score number
    const sn = String(s.score);
    const snW = bold.widthOfTextAtSize(sn, 16);
    p2.drawText(sn, { x: W - 50 - snW, y: rowY - 32, size: 16, font: bold, color: sc });

    rowY -= rowH;
  }

  drawFooter(p2, W, reg, 2, totalPages);

  // ===== PAGE 3 — Analysis & Recommendations =====
  const p3 = doc.addPage([W, H]);
  p3.drawRectangle({ x: 0, y: H - 80, width: W, height: 80, color: ORANGE });
  p3.drawText("ANALYSIS & RECOMMENDATIONS", { x: 50, y: H - 55, size: 24, font: bold, color: WHITE });

  y = H - 120;

  // Executive Summary
  if (analysis?.executiveSummary) {
    p3.drawText("Executive Summary", { x: 50, y, size: 14, font: bold, color: DARK_TEXT });
    y -= 20;
    const sumLines = wrapText(analysis.executiveSummary, 90);
    for (const line of sumLines) {
      if (y < 60) break;
      p3.drawText(line, { x: 50, y, size: 10, font: reg, color: MED_GRAY });
      y -= 15;
    }
    y -= 10;
  }

  // Strengths
  if (analysis?.strengths?.length) {
    p3.drawText("Key Strengths", { x: 50, y, size: 14, font: bold, color: DARK_TEXT });
    y -= 20;
    for (const s of analysis.strengths) {
      if (y < 60) break;
      p3.drawRectangle({ x: 50, y: y - 2, width: 3, height: 14, color: GREEN });
      const lines = wrapText(s, 85);
      for (const line of lines) {
        p3.drawText(line, { x: 62, y, size: 10, font: reg, color: DARK_TEXT });
        y -= 14;
      }
      y -= 4;
    }
    y -= 8;
  }

  // Gaps
  if (analysis?.gaps?.length) {
    p3.drawText("Critical Gaps", { x: 50, y, size: 14, font: bold, color: DARK_TEXT });
    y -= 20;
    for (const g of analysis.gaps) {
      if (y < 60) break;
      p3.drawRectangle({ x: 50, y: y - 2, width: 3, height: 14, color: ORANGE });
      const lines = wrapText(g, 85);
      for (const line of lines) {
        p3.drawText(line, { x: 62, y, size: 10, font: reg, color: DARK_TEXT });
        y -= 14;
      }
      y -= 4;
    }
    y -= 8;
  }

  // Recommendations
  if (analysis?.recommendations?.length) {
    p3.drawText("Top Recommendations", { x: 50, y, size: 14, font: bold, color: DARK_TEXT });
    y -= 20;
    for (const r of analysis.recommendations) {
      if (y < 100) break;
      // Card bg
      p3.drawRectangle({ x: 50, y: y - 36, width: W - 100, height: 50, color: LIGHT_ORANGE_BG });
      p3.drawRectangle({ x: 50, y: y - 36, width: 4, height: 50, color: ORANGE });
      p3.drawText(r.title, { x: 62, y: y - 2, size: 11, font: bold, color: DARK_TEXT });
      // Priority badge
      const pw = reg.widthOfTextAtSize(r.priority, 8);
      p3.drawRectangle({ x: W - 60 - pw, y: y - 5, width: pw + 10, height: 14, color: ORANGE });
      p3.drawText(r.priority, { x: W - 55 - pw, y: y - 2, size: 8, font: bold, color: WHITE });
      // Description
      const descLines = wrapText(r.description, 80);
      let dy = y - 18;
      for (const dl of descLines.slice(0, 2)) {
        p3.drawText(dl, { x: 62, y: dy, size: 9, font: reg, color: MED_GRAY });
        dy -= 13;
      }
      y -= 60;
    }
  }

  // CTA box
  if (y > 100) {
    const ctaY = 55;
    p3.drawRectangle({ x: 50, y: ctaY, width: W - 100, height: 50, color: ORANGE });
    const ctaText = "Ready to build your marketing engine?";
    const ctaW = bold.widthOfTextAtSize(ctaText, 14);
    p3.drawText(ctaText, { x: (W - ctaW) / 2, y: ctaY + 28, size: 14, font: bold, color: WHITE });
    const urlText = "orangedoormarketing.com/contact";
    const urlW = reg.widthOfTextAtSize(urlText, 11);
    p3.drawText(urlText, { x: (W - urlW) / 2, y: ctaY + 10, size: 11, font: reg, color: WHITE });
  }

  drawFooter(p3, W, reg, 3, totalPages);

  return await doc.save();
}

// --- Email HTML (unchanged) ---

const getScoreColor = (score: number): string => {
  if (score >= 70) return "#10b981";
  if (score >= 50) return "#eab308";
  if (score >= 30) return "#f97316";
  return "#ef4444";
};

function buildEmailHtml(params: ReportEmailRequest): string {
  const { firstName, businessName, resumeToken, scorecard, analysis } = params;
  const dashboardUrl = resumeToken
    ? `https://orangedoormarketing.com/dashboard/${resumeToken}`
    : null;

  const getScoreHex = (s: number) => s >= 70 ? "#2D6A4F" : s >= 50 ? "#B45309" : s >= 30 ? "#E8521A" : "#dc2626";
  const getScoreGradient = (s: number) => s >= 70 ? "#2D6A4F, #3A8A65" : s >= 50 ? "#B45309, #D97706" : s >= 30 ? "#E8521A, #F97316" : "#dc2626, #ef4444";

  const scoreRows = scorecard?.scores?.map((s) => {
    const hex = getScoreHex(s.score);
    const pct = Math.max(5, s.score);
    return `<tr>
      <td style="padding:12px 0;width:28px;vertical-align:middle;">
        <div style="width:28px;height:28px;border-radius:50%;background:#E8521A;text-align:center;line-height:28px;color:#fff;font-weight:bold;font-size:12px;">${s.category.replace("S2", "S")}</div>
      </td>
      <td style="padding:12px 12px;vertical-align:middle;">
        <div style="font-weight:600;color:#1A1410;font-size:13px;">${s.label}</div>
        <div style="font-size:11px;color:${hex};text-transform:capitalize;margin-top:2px;">${s.status}</div>
      </td>
      <td style="padding:12px 0;vertical-align:middle;width:180px;">
        <div style="background:#F0EBE2;border-radius:4px;height:8px;width:100%;">
          <div style="background:${hex};border-radius:4px;height:8px;width:${pct}%;"></div>
        </div>
      </td>
      <td style="padding:12px 0 12px 12px;color:${hex};font-weight:bold;font-size:15px;text-align:right;width:36px;">${s.score}</td>
    </tr>`;
  }).join("") || "";

  const strengthsList = analysis?.strengths?.map((s) =>
    `<tr><td style="padding:6px 0;vertical-align:top;width:20px;color:#2D6A4F;font-size:14px;">✓</td><td style="padding:6px 0;color:#1A1410;font-size:14px;line-height:1.5;">${s}</td></tr>`
  ).join("") || "";

  const gapsList = analysis?.gaps?.map((g) =>
    `<tr><td style="padding:6px 0;vertical-align:top;width:20px;color:#E8521A;font-size:14px;">▸</td><td style="padding:6px 0;color:#1A1410;font-size:14px;line-height:1.5;">${g}</td></tr>`
  ).join("") || "";

  const recommendationsList = analysis?.recommendations?.map((r) => `
    <div style="background:#1A1410;border-radius:8px;padding:16px;margin-bottom:10px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td><strong style="color:#FAF7F2;font-size:14px;">${r.title}</strong></td>
        <td align="right"><span style="background:#E8521A;color:#fff;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:600;">${r.priority}</span></td>
      </tr></table>
      <p style="margin:8px 0 0;color:#7A6355;font-size:13px;line-height:1.5;">${r.description}</p>
    </div>
  `).join("") || "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your SYSTEM Gap Report</title></head>
<body style="margin:0;padding:0;background:#F0EBE2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:620px;margin:0 auto;background:#ffffff;overflow:hidden;margin-top:24px;margin-bottom:24px;">

  <!-- Top accent bar -->
  <div style="height:4px;background:linear-gradient(90deg,#E8521A,#F97316);"></div>

  <!-- Header -->
  <div style="background:#1A1410;padding:36px 40px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <div style="color:#E8521A;font-weight:bold;font-size:13px;letter-spacing:2.5px;margin-bottom:2px;">ORANGE DOOR</div>
        <div style="color:#666;font-size:10px;letter-spacing:1.5px;">DIGITAL MARKETING</div>
      </td>
      <td align="right" valign="top"><span style="color:#666;font-size:11px;letter-spacing:0.5px;">SYSTEM Gap Report</span></td>
    </tr></table>
    <h1 style="color:#ffffff;margin:24px 0 0;font-size:28px;font-weight:700;line-height:1.2;font-family:Georgia,'Times New Roman',serif;">Your SYSTEM Gap Report</h1>
    <p style="color:#999;margin:8px 0 0;font-size:13px;">Prepared for ${businessName}</p>
  </div>

  <!-- Body -->
  <div style="padding:36px 40px 16px;">
    <p style="font-size:17px;color:#1A1410;margin:0 0 6px;font-weight:600;">Hi ${firstName},</p>
    <p style="font-size:14px;color:#7A6355;line-height:1.7;margin:0 0 28px;">
      Thank you for completing the Orange Door Gap Analysis. Here's your comprehensive SYSTEM health assessment for <strong style="color:#1A1410;">${businessName}</strong>.
    </p>

    ${scorecard ? `
    <!-- Score Card -->
    <div style="background:#1A1410;border-radius:12px;padding:32px 24px;text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;width:96px;height:96px;border-radius:50%;background:linear-gradient(135deg,${getScoreGradient(scorecard.overallScore)});text-align:center;line-height:96px;">
        <span style="font-size:36px;font-weight:bold;color:#ffffff;font-family:Georgia,'Times New Roman',serif;">${scorecard.overallScore}</span>
      </div>
      <p style="margin:14px 0 4px;font-size:11px;color:#7A6355;letter-spacing:2px;text-transform:uppercase;">OVERALL SCORE</p>
      <p style="margin:0;font-size:14px;color:#FAF7F2;">${scorecard.overallStatus}</p>
    </div>

    <!-- SYSTEM Breakdown -->
    <div style="background:#FAF7F2;border-radius:10px;padding:20px 24px;margin-bottom:28px;border:1px solid #F0EBE2;">
      <p style="margin:0 0 14px;font-size:13px;color:#7A6355;letter-spacing:1px;text-transform:uppercase;font-weight:600;">SYSTEM Breakdown</p>
      <table width="100%" cellpadding="0" cellspacing="0">${scoreRows}</table>
    </div>
    ` : ""}

    ${analysis?.executiveSummary ? `
    <div style="background:#FAF7F2;border-radius:10px;padding:20px 24px;margin-bottom:28px;border-left:3px solid #E8521A;">
      <p style="margin:0 0 8px;font-size:13px;color:#7A6355;letter-spacing:1px;text-transform:uppercase;font-weight:600;">Executive Summary</p>
      <p style="margin:0;color:#1A1410;font-size:14px;line-height:1.7;">${analysis.executiveSummary}</p>
    </div>
    ` : ""}

    ${strengthsList ? `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#1A1410;margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;">Key Strengths</h2>
      <div style="width:50px;height:2px;background:#2D6A4F;margin:0 0 14px;"></div>
      <table width="100%" cellpadding="0" cellspacing="0">${strengthsList}</table>
    </div>
    ` : ""}

    ${gapsList ? `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#1A1410;margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;">Critical Gaps</h2>
      <div style="width:50px;height:2px;background:#E8521A;margin:0 0 14px;"></div>
      <table width="100%" cellpadding="0" cellspacing="0">${gapsList}</table>
    </div>
    ` : ""}

    ${recommendationsList ? `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#1A1410;margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;">Top Recommendations</h2>
      <div style="width:50px;height:2px;background:#E8521A;margin:0 0 14px;"></div>
      ${recommendationsList}
    </div>
    ` : ""}

    ${dashboardUrl ? `
    <div style="background:#1A1410;border-radius:10px;padding:24px;margin-bottom:24px;text-align:center;">
      <p style="color:#FAF7F2;font-size:16px;font-weight:600;margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;">Your Personal Dashboard</p>
      <p style="color:#7A6355;font-size:13px;margin:0 0 16px;">Access your SYSTEM scores and track your progress anytime.</p>
      <a href="${dashboardUrl}" style="display:inline-block;background:linear-gradient(135deg,#E8521A,#F97316);color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">View Your Dashboard →</a>
    </div>
    ` : ""}

    <!-- CTA -->
    <div style="text-align:center;margin:32px 0 28px;">
      <a href="https://orangedoormarketing.com/schedule" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#E8521A,#F97316);color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;letter-spacing:0.5px;font-family:Georgia,'Times New Roman',serif;">Book a Free Strategy Call</a>
    </div>

    <p style="font-size:13px;color:#7A6355;line-height:1.7;text-align:center;margin:0 0 8px;">
      We'll walk you through your report, answer any questions, and show you exactly how we'd fix these issues — no obligation, no sales pressure.
    </p>

    <div style="border-top:1px solid #F0EBE2;margin:28px 0 0;padding:24px 0 0;">
      <p style="font-size:13px;color:#7A6355;margin:0;">
        Talk soon,<br><strong style="color:#1A1410;">The Orange Door Team</strong>
      </p>
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#FAF7F2;padding:20px 40px;text-align:center;font-size:11px;color:#999;border-top:1px solid #F0EBE2;">
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
    const { email, firstName, businessName, scorecard, analysis } = body;

    console.log("Sending gap report to:", email);

    // Generate PDF
    console.log("Generating gap report PDF...");
    const pdfBytes = await generateGapReportPDF({ firstName, businessName, scorecard, analysis });
    const pdfBase64 = btoa(String.fromCharCode(...pdfBytes));
    console.log("PDF generated, size:", pdfBytes.length, "bytes");

    // Build HTML email (unchanged)
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
