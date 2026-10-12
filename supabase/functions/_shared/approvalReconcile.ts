// Self-heal for client-approved social posts that lost their calendar slot.
//
// The client's "Upcoming/Scheduled" view is built from content_approvals, but
// only a content_calendar row with status=scheduled + client_approved=true is
// ever published. If that row is deleted or replaced after approval (manual
// delete, slot regeneration) the approval stays "approved" forever and the post
// silently never goes out -- found live: Innermetrix LinkedIn Oct 13/20/27.
//
// Runs from publish-scheduled-content (every 15 min). Idempotent and
// conservative: it only touches FUTURE approvals that no calendar row points
// at, and never one the admin explicitly cancelled (publish_status
// superseded/cancelled -- see the admin delete action).

import { logActivity } from "./activityLog.ts";
import { logAlert } from "./alerts.ts";

export interface OrphanApproval {
  id: string;
  content_id: string | null;
  client_account_id: string;
  platform: string | null;
  scheduled_for: string;
}

export interface CalendarRowLite {
  id: string;
  client_account_id: string;
  platform: string | null;
  status: string;
  client_approved: boolean | null;
  scheduled_for: string;
  content_id: string | null;
  // generated_content.metadata.scheduled_for of the linked draft: a slot that
  // was moved (e.g. "publish now") keeps covering its ORIGINAL day.
  gen_scheduled_for?: string | null;
  approval_id?: string | null;
}

export type ReconcilePlan =
  | { action: "linked" }
  | { action: "covered" }
  | { action: "adopt"; slotId: string }
  | { action: "insert" };

const day = (iso: string | null | undefined): string | null => (iso ? new Date(iso).toISOString().slice(0, 10) : null);

export function planOrphan(a: OrphanApproval, rows: CalendarRowLite[]): ReconcilePlan {
  const mine = rows.filter((r) => r.client_account_id === a.client_account_id);

  if (mine.some((r) => (a.content_id && r.content_id === a.content_id) || r.approval_id === a.id)) {
    return { action: "linked" };
  }

  const d = day(a.scheduled_for);
  const samePlatform = mine.filter((r) => r.platform === a.platform);

  // Another approved/in-flight/finished post already owns this day on this
  // platform (including one that was moved off the day): don't double-post.
  const covered = samePlatform.some(
    (r) => r.status !== "draft" && (day(r.scheduled_for) === d || day(r.gen_scheduled_for) === d),
  );
  if (covered) return { action: "covered" };

  const slot = samePlatform.find((r) => r.status === "draft" && !r.client_approved && day(r.scheduled_for) === d);
  if (slot) return { action: "adopt", slotId: slot.id };

  return { action: "insert" };
}

export interface ReconcileSummary {
  checked: number;
  adopted: number;
  inserted: number;
  superseded: number;
}

export async function reconcileApprovedContent(supabase: any): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { checked: 0, adopted: 0, inserted: 0, superseded: 0 };
  try {
    const nowIso = new Date().toISOString();
    const { data: approvals, error } = await supabase
      .from("content_approvals")
      .select("id, content_id, client_account_id, platform, scheduled_for, title, full_content, content_preview, content_type")
      .eq("status", "approved")
      .eq("content_type", "social_post")
      .gte("scheduled_for", nowIso)
      .or("publish_status.is.null,publish_status.not.in.(superseded,cancelled)")
      .limit(200);
    if (error) throw error;
    if (!approvals?.length) return summary;

    const clientIds = [...new Set(approvals.map((a: any) => a.client_account_id))];
    const { data: calRaw, error: calErr } = await supabase
      .from("content_calendar")
      .select("id, client_account_id, platform, status, client_approved, scheduled_for, content_id, metadata")
      .in("client_account_id", clientIds)
      .eq("content_type", "social_post")
      .gte("scheduled_for", new Date(Date.now() - 2 * 86_400_000).toISOString());
    if (calErr) throw calErr;

    const contentIds = [...new Set((calRaw ?? []).map((r: any) => r.content_id).filter(Boolean))];
    const genMeta = new Map<string, any>();
    if (contentIds.length) {
      const { data: gens } = await supabase.from("generated_content").select("id, status, metadata").in("id", contentIds);
      for (const g of gens ?? []) genMeta.set(g.id, g);
    }

    const rows: CalendarRowLite[] = (calRaw ?? []).map((r: any) => ({
      id: r.id,
      client_account_id: r.client_account_id,
      platform: r.platform,
      status: r.status,
      client_approved: r.client_approved,
      scheduled_for: r.scheduled_for,
      content_id: r.content_id,
      gen_scheduled_for: r.content_id ? genMeta.get(r.content_id)?.metadata?.scheduled_for ?? null : null,
      approval_id: r.metadata?.content_approval_id ?? null,
    }));

    for (const a of approvals as any[]) {
      summary.checked++;
      const plan = planOrphan(a, rows);
      if (plan.action === "linked") continue;

      const text = a.full_content || a.content_preview || "";
      if (plan.action === "covered") {
        await supabase.from("content_approvals").update({ publish_status: "superseded" }).eq("id", a.id);
        summary.superseded++;
        continue;
      }

      let ok = false;
      let slotId: string | null = null;
      if (plan.action === "adopt") {
        const old = rows.find((r) => r.id === plan.slotId);
        const { data: updated } = await supabase
          .from("content_calendar")
          .update({
            content: text,
            title: a.title || "",
            status: "scheduled",
            client_approved: true,
            content_id: a.content_id,
            error_message: null,
            metadata: {
              source: "content_approvals",
              content_approval_id: a.id,
              generated_content_id: a.content_id,
              reconciled_at: nowIso,
            },
          })
          .eq("id", plan.slotId)
          .eq("status", "draft") // guard against a concurrent approval/publish
          .select("id");
        ok = !!updated?.length;
        slotId = plan.slotId;
        // The slot's own unapproved draft is now a duplicate of the approved
        // post; drop it (cascade removes its pending approval) so the client
        // isn't asked to review a second post for the same day. Never touch
        // anything the client already approved.
        if (ok && old?.content_id && old.content_id !== a.content_id) {
          const g = genMeta.get(old.content_id);
          if (g && ["pending_admin_review", "draft"].includes(g.status)) {
            await supabase.from("generated_content").delete().eq("id", old.content_id);
          }
        }
      } else {
        const { data: inserted } = await supabase
          .from("content_calendar")
          .insert({
            client_account_id: a.client_account_id,
            content_id: a.content_id,
            content_type: a.content_type,
            platform: a.platform,
            content: text,
            title: a.title || "",
            status: "scheduled",
            client_approved: true,
            scheduled_for: a.scheduled_for,
            metadata: { source: "content_approvals", content_approval_id: a.id, reconciled_at: nowIso },
          })
          .select("id");
        ok = !!inserted?.length;
        slotId = inserted?.[0]?.id ?? null;
      }
      if (!ok) continue;

      if (a.content_id && slotId) {
        const g = genMeta.get(a.content_id);
        const { data: own } = g ? { data: g } : await supabase.from("generated_content").select("metadata").eq("id", a.content_id).maybeSingle();
        await supabase
          .from("generated_content")
          .update({ metadata: { ...(own?.metadata ?? {}), content_calendar_slot_id: slotId } })
          .eq("id", a.content_id);
      }
      await supabase.from("content_approvals").update({ publish_status: "queued" }).eq("id", a.id);
      if (plan.action === "adopt") summary.adopted++;
      else summary.inserted++;

      await logActivity(supabase, a.client_account_id, {
        type: "content_rescheduled",
        title: `Re-scheduled approved ${a.platform} post: ${a.title ?? "post"}`,
        description: "This post was approved but its calendar slot was missing, so it was put back on the schedule automatically.",
        icon: "calendar",
        metadata: { approval_id: a.id, slot_id: slotId, platform: a.platform },
      });
      await logAlert(supabase, {
        source: "reconcile-approved-content",
        alertType: "approved_content_reconciled",
        severity: "warning",
        title: `Approved ${a.platform} post re-attached to the calendar`,
        message: `Approval ${a.id} (due ${a.scheduled_for}) had no calendar row and would never have published. It was ${plan.action === "adopt" ? "moved into the existing draft slot" : "re-created as a scheduled row"}.`,
        sourceId: a.id,
        metadata: { client_account_id: a.client_account_id, platform: a.platform, slot_id: slotId },
      });
    }
  } catch (e) {
    // Self-heal must never block publishing.
    console.error("reconcileApprovedContent failed:", e instanceof Error ? e.message : e);
  }
  return summary;
}
