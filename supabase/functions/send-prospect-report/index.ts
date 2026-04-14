import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// --- Brand palette ---
const ORANGE = rgb(0.91, 0.322, 0.141);
const WHITE = rgb(1, 1, 1);
const DARK = rgb(0.102, 0.078, 0.063);
const MED_GRAY = rgb(0.48, 0.39, 0.33);
const LIGHT_BG = rgb(0.98, 0.969, 0.949);
const LIGHT_RULE = rgb(0.941, 0.922, 0.886);
const GREEN = rgb(0.176, 0.416, 0.31);
const AMBER = rgb(0.706, 0.329, 0.035);
const RED = rgb(0.863, 0.208, 0.208);

function scoreColor(score: number) {
  if (score >= 70) return GREEN;
  if (score >= 50) return AMBER;
  if (score >= 30) return ORANGE;
  return RED;
}

function scoreLabel(score: number): string {
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

function drawPageChrome(
  page: ReturnType<typeof PDFDocument.prototype.addPage>,
  W: number,
  H: number,
  reg: any,
  bold: any,
  pageNum: number,
  totalPages: number,
) {
  // Top accent line
  page.drawRectangle({ x: 0, y: H - 3, width: W, height: 3, color: ORANGE });

  // Footer
  page.drawRectangle({ x: 0, y: 0, width: W, height: 36, color: LIGHT_BG });
  page.drawLine({ start: { x: 0, y: 36 }, end: { x: W, y: 36 }, thickness: 0.5, color: LIGHT_RULE });
  page.drawText("Orange Door Consulting", { x: 40, y: 14, size: 8, font: reg, color: MED_GRAY });
  page.drawText("orangedoormarketing.com", { x: W - 170, y: 14, size: 8, font: reg, color: ORANGE });
  const pn = `${pageNum} / ${totalPages}`;
  const pnW = reg.widthOfTextAtSize(pn, 7);
  page.drawText(pn, { x: (W - pnW) / 2, y: 14, size: 7, font: reg, color: MED_GRAY });
}

interface ProspectData {
  name: string;
  email: string;
  website_url: string;
  gap_score: number | null;
  top_weaknesses: string[] | null;
  seo_score: number | null;
  conversion_score: number | null;
  technical_score: number | null;
  summary: string | null;
  quick_wins: { title: string; description: string }[] | null;
}

async function generateProspectPDF(prospect: ProspectData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const W = 612;
  const H = 792;
  const score = prospect.gap_score ?? 0;
  const tierLabel = getTierLabel(score);
  const firstName = prospect.name?.split(" ")[0] || "there";
  const totalPages = 2;

  // ===== PAGE 1 — Cover & Score Overview =====
  const p1 = doc.addPage([W, H]);
  drawPageChrome(p1, W, H, reg, bold, 1, totalPages);

  // Header block
  p1.drawRectangle({ x: 0, y: H - 140, width: W, height: 137, color: DARK });
  p1.drawText("ORANGE DOOR", { x: 40, y: H - 45, size: 10, font: bold, color: ORANGE });
  p1.drawText("DIGITAL MARKETING", { x: 40, y: H - 58, size: 7, font: reg, color: rgb(0.6, 0.6, 0.6) });

  p1.drawText("Website Marketing Report", { x: 40, y: H - 100, size: 28, font: bold, color: WHITE });
  const domain = prospect.website_url?.replace(/^https?:\/\//, "").replace(/\/$/, "") || "";
  p1.drawText(domain, { x: 40, y: H - 120, size: 12, font: reg, color: rgb(0.7, 0.7, 0.7) });

  // Date
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const dateW = reg.widthOfTextAtSize(dateStr, 10);
  p1.drawText(dateStr, { x: W - 40 - dateW, y: H - 120, size: 10, font: reg, color: rgb(0.7, 0.7, 0.7) });

  // Greeting
  let y = H - 180;
  p1.drawText(`Hi ${firstName},`, { x: 40, y, size: 14, font: bold, color: DARK });
  y -= 22;
  const introLines = wrapText(
    `Thanks for checking your website with us! Here's what our AI found when it analyzed ${prospect.website_url || "your website"}. This report highlights the most impactful opportunities to attract more customers online.`,
    90,
  );
  for (const line of introLines) {
    p1.drawText(line, { x: 40, y, size: 11, font: reg, color: MED_GRAY });
    y -= 16;
  }

  // Overall score card
  y -= 15;
  const cardY = y - 120;
  p1.drawRectangle({ x: 40, y: cardY, width: W - 80, height: 120, color: LIGHT_BG });
  p1.drawRectangle({ x: 40, y: cardY, width: 4, height: 120, color: ORANGE });

  // Score circle
  const cx = 110;
  const cy = cardY + 60;
  const sc = scoreColor(score);
  p1.drawCircle({ x: cx, y: cy, size: 36, color: sc });
  const scoreTxt = String(score);
  const sw = bold.widthOfTextAtSize(scoreTxt, 28);
  p1.drawText(scoreTxt, { x: cx - sw / 2, y: cy - 10, size: 28, font: bold, color: WHITE });
  p1.drawText("/ 100", { x: cx - 14, y: cy - 26, size: 8, font: reg, color: WHITE });

  // Tier recommendation
  p1.drawText("Recommended Plan", { x: 180, y: cardY + 90, size: 9, font: reg, color: MED_GRAY });
  p1.drawText(`${tierLabel} Tier`, { x: 180, y: cardY + 70, size: 20, font: bold, color: DARK });
  p1.drawText(scoreLabel(score), { x: 180, y: cardY + 50, size: 11, font: bold, color: sc });

  // Category mini-scores
  const categories = [
    { label: "SEO & Visibility", score: prospect.seo_score ?? 0 },
    { label: "Conversion Elements", score: prospect.conversion_score ?? 0 },
    { label: "Technical Performance", score: prospect.technical_score ?? 0 },
  ];

  y = cardY - 30;
  p1.drawText("Category Breakdown", { x: 40, y, size: 12, font: bold, color: DARK });
  y -= 20;

  for (const cat of categories) {
    const cc = scoreColor(cat.score);
    p1.drawText(cat.label, { x: 40, y, size: 10, font: reg, color: DARK });
    // Bar background
    const barX = 240;
    const barW = 260;
    p1.drawRectangle({ x: barX, y: y - 2, width: barW, height: 8, color: LIGHT_RULE });
    // Bar fill
    const fillW = Math.max(4, (cat.score / 100) * barW);
    p1.drawRectangle({ x: barX, y: y - 2, width: fillW, height: 8, color: cc });
    // Score number
    const sn = String(cat.score);
    const snW = bold.widthOfTextAtSize(sn, 11);
    p1.drawText(sn, { x: barX + barW + 10, y: y - 1, size: 11, font: bold, color: cc });
    // Status label
    p1.drawText(scoreLabel(cat.score), { x: barX + barW + 10 + snW + 6, y: y - 1, size: 9, font: reg, color: cc });
    y -= 24;
  }

  // ===== PAGE 2 — Top Weaknesses & Quick Wins =====
  const p2 = doc.addPage([W, H]);
  drawPageChrome(p2, W, H, reg, bold, 2, totalPages);

  // Header
  p2.drawRectangle({ x: 0, y: H - 70, width: W, height: 67, color: DARK });
  p2.drawText("FINDINGS & NEXT STEPS", { x: 40, y: H - 50, size: 22, font: bold, color: WHITE });

  y = H - 110;

  // Top weaknesses
  const weaknesses = prospect.top_weaknesses || [];
  if (weaknesses.length > 0) {
    p2.drawText("Your Top Areas to Improve", { x: 40, y, size: 14, font: bold, color: DARK });
    y -= 6;
    p2.drawLine({ start: { x: 40, y }, end: { x: 200, y }, thickness: 1.5, color: ORANGE });
    y -= 18;

    for (let i = 0; i < weaknesses.length; i++) {
      const numTxt = `${i + 1}.`;
      p2.drawText(numTxt, { x: 40, y, size: 11, font: bold, color: ORANGE });
      const lines = wrapText(weaknesses[i], 82);
      for (const line of lines) {
        p2.drawText(line, { x: 62, y, size: 10, font: reg, color: DARK });
        y -= 15;
      }
      y -= 6;
    }
    y -= 10;
  }

  // Quick wins
  const quickWins = prospect.quick_wins || [];
  if (quickWins.length > 0) {
    p2.drawText("Quick Wins You Can Do This Week", { x: 40, y, size: 14, font: bold, color: DARK });
    y -= 6;
    p2.drawLine({ start: { x: 40, y }, end: { x: 240, y }, thickness: 1.5, color: GREEN });
    y -= 18;

    for (const win of quickWins.slice(0, 5)) {
      if (y < 120) break;
      // Card background
      p2.drawRectangle({ x: 40, y: y - 30, width: W - 80, height: 40, color: LIGHT_BG });
      p2.drawRectangle({ x: 40, y: y - 30, width: 3, height: 40, color: GREEN });
      p2.drawText(win.title, { x: 52, y: y - 2, size: 10, font: bold, color: DARK });
      const descLines = wrapText(win.description, 80);
      for (const dl of descLines.slice(0, 2)) {
        p2.drawText(dl, { x: 52, y: y - 16, size: 9, font: reg, color: MED_GRAY });
        y -= 12;
      }
      y -= 28;
    }
  }

  // Summary paragraph
  if (prospect.summary && y > 140) {
    y -= 10;
    p2.drawText("Summary", { x: 40, y, size: 14, font: bold, color: DARK });
    y -= 6;
    p2.drawLine({ start: { x: 40, y }, end: { x: 110, y }, thickness: 1.5, color: ORANGE });
    y -= 16;
    const sumLines = wrapText(prospect.summary, 90);
    for (const line of sumLines) {
      if (y < 80) break;
      p2.drawText(line, { x: 40, y, size: 10, font: reg, color: MED_GRAY });
      y -= 14;
    }
  }

  // CTA box at bottom
  const ctaY = 50;
  p2.drawRectangle({ x: 40, y: ctaY, width: W - 80, height: 50, color: ORANGE });
  const ctaText = "Ready to fix these issues? Book a free strategy call.";
  const ctaW = bold.widthOfTextAtSize(ctaText, 13);
  p2.drawText(ctaText, { x: (W - ctaW) / 2, y: ctaY + 28, size: 13, font: bold, color: WHITE });
  const urlText = "orangedoormarketing.com/schedule";
  const urlW = reg.widthOfTextAtSize(urlText, 10);
  p2.drawText(urlText, { x: (W - urlW) / 2, y: ctaY + 12, size: 10, font: reg, color: WHITE });

  return await doc.save();
}

function buildEmailHtml(prospect: ProspectData): string {
  const score = prospect.gap_score;
  const weaknesses = prospect.top_weaknesses || [];
  const tierLabel = score != null ? getTierLabel(score) : "Growth";
  const firstName = prospect.name?.split(" ")[0] || "there";
  const domain = prospect.website_url?.replace(/^https?:\/\//, "").replace(/\/$/, "") || "";

  const getScoreHex = (s: number) => s >= 70 ? "#2D6A4F" : s >= 50 ? "#B45309" : s >= 30 ? "#E8521A" : "#dc2626";
  const getScoreGradient = (s: number) => s >= 70 ? "#2D6A4F, #3A8A65" : s >= 50 ? "#B45309, #D97706" : s >= 30 ? "#E8521A, #F97316" : "#dc2626, #ef4444";

  const weaknessHtml = weaknesses.length > 0
    ? weaknesses.map((w: string, i: number) =>
        `<tr>
          <td style="padding:14px 16px;font-weight:bold;color:#E8521A;vertical-align:top;width:36px;font-size:18px;font-family:Georgia,'Times New Roman',serif;">${i + 1}.</td>
          <td style="padding:14px 16px 14px 0;color:#FAF7F2;font-size:14px;line-height:1.6;">${w}</td>
        </tr>`
      ).join("")
    : `<tr><td style="padding:14px 16px;color:#999;">Your detailed analysis is being finalized.</td></tr>`;

  const categoryHtml = [
    { label: "SEO & Visibility", score: prospect.seo_score ?? 0 },
    { label: "Conversion Elements", score: prospect.conversion_score ?? 0 },
    { label: "Technical Performance", score: prospect.technical_score ?? 0 },
  ].map(cat => {
    const hex = getScoreHex(cat.score);
    const pct = Math.max(5, cat.score);
    return `<tr>
      <td style="padding:10px 0;color:#1A1410;font-size:13px;font-weight:600;width:160px;">${cat.label}</td>
      <td style="padding:10px 0;">
        <div style="background:#F0EBE2;border-radius:4px;height:8px;width:100%;">
          <div style="background:${hex};border-radius:4px;height:8px;width:${pct}%;"></div>
        </div>
      </td>
      <td style="padding:10px 0 10px 12px;color:${hex};font-weight:bold;font-size:14px;text-align:right;width:40px;">${cat.score}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
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
      <td align="right" valign="top"><span style="color:#666;font-size:11px;letter-spacing:0.5px;">Website Report</span></td>
    </tr></table>
    <h1 style="color:#ffffff;margin:24px 0 0;font-size:28px;font-weight:700;line-height:1.2;font-family:Georgia,'Times New Roman',serif;">Your Free Marketing Report</h1>
    <p style="margin:8px 0 0;font-size:13px;"><a href="${prospect.website_url || '#'}" style="color:#E8521A;text-decoration:none;">${domain}</a></p>
  </div>

  <!-- Body -->
  <div style="padding:36px 40px 16px;">
    <p style="font-size:17px;color:#1A1410;margin:0 0 6px;font-weight:600;">Hi ${firstName},</p>
    <p style="font-size:14px;color:#7A6355;line-height:1.7;margin:0 0 28px;">
      Thanks for checking your website with us! Here's what our AI found when it analyzed
      <a href="${prospect.website_url || '#'}" style="color:#E8521A;text-decoration:underline;">${domain}</a>.
    </p>

    ${score != null ? `
    <!-- Score Card -->
    <div style="background:#1A1410;border-radius:12px;padding:32px 24px;text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;width:96px;height:96px;border-radius:50%;background:linear-gradient(135deg,${getScoreGradient(score)});text-align:center;line-height:96px;">
        <span style="font-size:36px;font-weight:bold;color:#ffffff;font-family:Georgia,'Times New Roman',serif;">${score}</span>
      </div>
      <p style="margin:14px 0 4px;font-size:11px;color:#7A6355;letter-spacing:2px;text-transform:uppercase;">OUT OF 100</p>
      <p style="margin:0;font-size:18px;font-weight:bold;color:#FAF7F2;font-family:Georgia,'Times New Roman',serif;">Recommended: ${tierLabel} Tier</p>
    </div>
    ` : ""}

    ${score != null ? `
    <!-- Category Breakdown -->
    <div style="background:#FAF7F2;border-radius:10px;padding:20px 24px;margin-bottom:28px;border:1px solid #F0EBE2;">
      <p style="margin:0 0 12px;font-size:13px;color:#7A6355;letter-spacing:1px;text-transform:uppercase;font-weight:600;">Category Breakdown</p>
      <table width="100%" cellpadding="0" cellspacing="0">${categoryHtml}</table>
    </div>
    ` : ""}

    <!-- Top Areas to Improve -->
    <div style="background:#1A1410;border-radius:12px;padding:28px;margin-bottom:28px;">
      <h2 style="font-size:18px;color:#FAF7F2;margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;">Your Top Areas to Improve</h2>
      <div style="width:60px;height:2px;background:#E8521A;margin:0 0 8px;"></div>
      <p style="font-size:13px;color:#7A6355;margin:0 0 16px;line-height:1.5;">Here's where you're leaving the most customers on the table:</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${weaknessHtml}
      </table>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin:32px 0 28px;">
      <a href="https://slick-doc-site.lovable.app/schedule" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#E8521A,#F97316);color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;letter-spacing:0.5px;font-family:Georgia,'Times New Roman',serif;">Book a Free Strategy Call</a>
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { prospectId } = await req.json();
    if (!prospectId) throw new Error("prospectId is required");

    // Fetch prospect
    const { data: prospect, error: fetchError } = await supabase
      .from("prospects")
      .select("*")
      .eq("id", prospectId)
      .single();

    if (fetchError || !prospect) throw new Error("Prospect not found");

    console.log(`Generating report for ${prospect.email}...`);

    // Generate PDF
    const pdfBytes = await generateProspectPDF(prospect as ProspectData);
    const pdfBase64 = btoa(String.fromCharCode(...pdfBytes));
    console.log(`PDF generated: ${pdfBytes.length} bytes`);

    // Build HTML email
    const html = buildEmailHtml(prospect as ProspectData);

    // Send via Resend SDK (direct, not gateway)
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

    console.log(`Report email sent to ${prospect.email}:`, emailResponse);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-prospect-report error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
