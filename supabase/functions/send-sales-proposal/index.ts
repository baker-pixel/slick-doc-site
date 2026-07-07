import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { corsHeaders, handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface ProposedService { name: string; description: string; price: number }
interface PricingItem { item: string; price: number; frequency: string }
interface TimelinePhase { phase: string; duration: string; deliverables: string[] }

function formatServices(services: ProposedService[] | null): string {
  if (!services?.length) return "";
  return services.map(s => `
    <div style="margin-bottom: 12px; padding: 12px; background: #f9f8f5; border-radius: 6px;">
      <strong>${escapeHtml(s.name)}</strong>
      <p style="margin: 4px 0 0; color: #6b6b6f; font-size: 14px;">${escapeHtml(s.description)}</p>
    </div>`).join("");
}

function formatPricing(items: PricingItem[] | null): string {
  if (!items?.length) return "";
  const rows = items.map(i => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e4e2dc;">${escapeHtml(i.item)}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e4e2dc; text-align: right;">$${i.price.toLocaleString()} ${i.frequency === "monthly" ? "/mo" : i.frequency === "yearly" ? "/yr" : ""}</td>
    </tr>`).join("");
  return `<table style="width: 100%; border-collapse: collapse; margin-top: 8px;">${rows}</table>`;
}

function formatTimeline(timeline: TimelinePhase[] | null): string {
  if (!timeline?.length) return "";
  return timeline.map(t => `
    <div style="margin-bottom: 10px;">
      <strong>${escapeHtml(t.phase)}</strong> <span style="color: #6b6b6f; font-size: 13px;">(${escapeHtml(t.duration)})</span>
      <ul style="margin: 4px 0 0; padding-left: 20px; color: #6b6b6f; font-size: 14px;">
        ${(t.deliverables || []).map(d => `<li>${escapeHtml(d)}</li>`).join("")}
      </ul>
    </div>`).join("");
}

function escapeHtml(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { proposalId } = await req.json();
    if (!proposalId) throw new Error("proposalId is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: proposal, error } = await supabase
      .from("sales_proposals")
      .select("*")
      .eq("id", proposalId)
      .single();
    if (error || !proposal) throw new Error("Proposal not found");

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9f8f5;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:640px;margin:32px auto;background:#fff;border:1px solid #e4e2dc;border-radius:8px;overflow:hidden;">
    <div style="background:#1e3a5f;padding:24px 28px;">
      <div style="color:#fff;font-size:18px;font-weight:700;">A proposal for ${escapeHtml(proposal.prospect_business)}</div>
    </div>
    <div style="padding:28px;">
      <p>Hi ${escapeHtml(proposal.prospect_name)},</p>
      <p>Thanks for the conversation — here's a proposal built specifically for ${escapeHtml(proposal.prospect_business)}.</p>

      ${proposal.proposed_services ? `<h3 style="margin-bottom:8px;">Proposed Services</h3>${formatServices(proposal.proposed_services as ProposedService[])}` : ""}
      ${proposal.timeline ? `<h3 style="margin-bottom:8px;">Timeline</h3>${formatTimeline(proposal.timeline as TimelinePhase[])}` : ""}
      ${proposal.pricing_breakdown ? `<h3 style="margin-bottom:8px;">Investment</h3>${formatPricing(proposal.pricing_breakdown as PricingItem[])}` : ""}
      ${proposal.total_investment ? `<p style="margin-top:16px;font-size:16px;"><strong>Estimated annual investment: $${Number(proposal.total_investment).toLocaleString()}</strong></p>` : ""}

      <p style="margin-top:24px;">Happy to walk through any of this on a call — just reply to this email.</p>
      <p>The Orange Door Team</p>
    </div>
  </div>
</body>
</html>`;

    const sendResult = await resend.emails.send({
      from: "Orange Door Marketing <hello@orangedoormarketing.com>",
      to: [proposal.prospect_email],
      subject: `A proposal for ${proposal.prospect_business}`,
      html,
    });

    if (sendResult.error) {
      throw new Error(`Resend error: ${sendResult.error.message}`);
    }

    return jsonResponse({ success: true, emailId: sendResult.data?.id ?? null });
  } catch (err) {
    console.error("send-sales-proposal error:", err);
    return errorResponse(err);
  }
});
