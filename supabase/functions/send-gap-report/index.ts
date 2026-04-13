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

  const scoreRows = scorecard?.scores?.map((s) => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">
        <strong style="color: #f97316;">${s.category.replace("S2", "S")}</strong> ${s.label}
      </td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
        <span style="color: ${getScoreColor(s.score)}; font-weight: bold;">${s.score}</span>
      </td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
        <span style="text-transform: capitalize; color: ${getScoreColor(s.score)};">${s.status}</span>
      </td>
    </tr>
  `).join("") || "";

  const strengthsList = analysis?.strengths?.map((s) => `<li style="margin-bottom: 6px; color: #374151;">${s}</li>`).join("") || "";
  const gapsList = analysis?.gaps?.map((g) => `<li style="margin-bottom: 6px; color: #374151;">${g}</li>`).join("") || "";
  const recommendationsList = analysis?.recommendations?.map((r) => `
    <div style="background: #f9fafb; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
        <strong style="color: #111827;">${r.title}</strong>
        <span style="background: #f97316; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${r.priority}</span>
      </div>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">${r.description}</p>
    </div>
  `).join("") || "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your SYSTEM Gap Report</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">Your SYSTEM Gap Report</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Prepared for ${businessName}</p>
    </div>
    <div style="padding: 32px;">
      <p style="color: #374151; font-size: 16px; line-height: 1.6;">Hi ${firstName},</p>
      <p style="color: #374151; font-size: 16px; line-height: 1.6;">Thank you for completing the Orange Door Gap Analysis. Here's your comprehensive SYSTEM health assessment for ${businessName}.</p>
      ${scorecard ? `
      <div style="text-align: center; padding: 24px; background: #fef7ed; border-radius: 12px; margin: 24px 0;">
        <div style="font-size: 48px; font-weight: bold; color: #f97316; margin-bottom: 8px;">${scorecard.overallScore}</div>
        <div style="color: #9a3412; font-size: 14px;">${scorecard.overallStatus}</div>
      </div>
      <h2 style="color: #111827; font-size: 18px; margin: 24px 0 16px;">SYSTEM Breakdown</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead><tr style="background: #f9fafb;">
          <th style="padding: 10px 12px; text-align: left; color: #6b7280; font-size: 12px; text-transform: uppercase;">Category</th>
          <th style="padding: 10px 12px; text-align: center; color: #6b7280; font-size: 12px; text-transform: uppercase;">Score</th>
          <th style="padding: 10px 12px; text-align: center; color: #6b7280; font-size: 12px; text-transform: uppercase;">Status</th>
        </tr></thead>
        <tbody>${scoreRows}</tbody>
      </table>` : ""}
      ${analysis?.executiveSummary ? `
      <h2 style="color: #111827; font-size: 18px; margin: 24px 0 12px;">Executive Summary</h2>
      <p style="color: #374151; font-size: 14px; line-height: 1.7; background: #f9fafb; padding: 16px; border-radius: 8px;">${analysis.executiveSummary}</p>` : ""}
      ${strengthsList ? `<h2 style="color: #111827; font-size: 18px; margin: 24px 0 12px;">✓ Key Strengths</h2><ul style="padding-left: 20px; margin: 0;">${strengthsList}</ul>` : ""}
      ${gapsList ? `<h2 style="color: #111827; font-size: 18px; margin: 24px 0 12px;">⚠ Critical Gaps</h2><ul style="padding-left: 20px; margin: 0;">${gapsList}</ul>` : ""}
      ${recommendationsList ? `<h2 style="color: #111827; font-size: 18px; margin: 24px 0 12px;">💡 Top Recommendations</h2>${recommendationsList}` : ""}
      ${dashboardUrl ? `
      <div style="background: linear-gradient(135deg, #fef7ed 0%, #ffedd5 100%); border: 2px solid #f97316; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
        <h3 style="color: #9a3412; margin: 0 0 8px; font-size: 18px;">📊 Your Personal Dashboard</h3>
        <p style="color: #c2410c; font-size: 14px; margin: 0 0 16px;">Access your SYSTEM scores, recommendations, and track your progress anytime.</p>
        <a href="${dashboardUrl}" style="display: inline-block; background: #f97316; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">View Your Dashboard →</a>
      </div>` : ""}
      <div style="text-align: center; margin: 32px 0;">
        <a href="https://orangedoormarketing.com/contact" style="display: inline-block; background: #111827; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600;">Schedule Your Strategy Call</a>
      </div>
      <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">Our team will reach out within 24-48 hours to schedule a complimentary strategy call where we'll dive deeper into your results and discuss how we can help grow your business.</p>
    </div>
    <div style="background: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 14px; margin: 0;">Orange Door Consultants<br>East Tennessee's Growth Partner for SMBs</p>
    </div>
  </div>
</body>
</html>`;
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
