import { notifyClientBlocked } from "./clientAlerts.ts";
import { logActivity } from "./activityLog.ts";

// A reply/bounce may only change a prospect that is still in the outreach
// funnel -- never resurrect an unsubscribed or converted one.
const REPLYABLE_STATUSES = ["nurture", "exhausted", "pending"];

export interface IngestReplyArgs {
  clientId: string;
  prospectId: string | null;
  emailLogId: string | null;
  messageId: string;
  inReplyTo: string | null;
  fromAddress: string | null;
  subject: string;
  receivedAt: string;
  isBounce: boolean;
  matchMethod: "tracking_id" | "sender";
  /** Full reply text (null for bounces -- a DSN body is noise). */
  replyBody: string | null;
  /** Short preview stored beside the body. */
  snippet: string | null;
}

export interface IngestReplyResult {
  /** True when this call created the prospect_replies row (not a re-delivery). */
  stored: boolean;
  replied: boolean;
  bounced: boolean;
}

/**
 * Records one reply/bounce that is provably tied to our outreach and applies
 * its side effects: prospect status, client notification, activity log, and
 * cancelling the rest of the prospect's sequence. Shared by the IMAP poller
 * and the inbound-email webhook so both paths behave identically. Idempotent
 * per (client_id, message_id): a message already fully processed is a no-op.
 * Never throws on a storage failure -- the prospect handling still runs.
 */
export async function ingestReply(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  a: IngestReplyArgs,
): Promise<IngestReplyResult> {
  const out: IngestReplyResult = { stored: false, replied: false, bounced: false };

  const { data: existing } = await supabase
    .from("prospect_replies")
    .select("id, processed_at")
    .eq("client_id", a.clientId)
    .eq("message_id", a.messageId)
    .maybeSingle();
  if (existing?.processed_at) return out;

  const { data: stored, error: storeErr } = await supabase
    .from("prospect_replies")
    .upsert({
      client_id: a.clientId,
      prospect_id: a.prospectId,
      email_log_id: a.emailLogId,
      message_id: a.messageId,
      in_reply_to: a.inReplyTo ? a.inReplyTo.slice(0, 500) : null,
      from_address: a.fromAddress,
      subject: a.subject.slice(0, 500),
      received_at: a.receivedAt,
      classification: a.isBounce ? "bounce" : "reply",
      match_method: a.matchMethod,
      snippet: a.snippet,
      body_text: a.replyBody,
    }, { onConflict: "client_id,message_id" })
    .select("id")
    .maybeSingle();
  // Storing is the record-keeping layer; if it fails the prospect handling
  // below must still run, so log and carry on.
  if (storeErr) console.error(`[replyIngest] ${a.clientId}: prospect_replies upsert failed:`, storeErr.message);
  else if (!existing) out.stored = true;
  const replyRowId: string | null = stored?.id ?? existing?.id ?? null;

  const markProcessed = async () => {
    if (replyRowId) {
      await supabase.from("prospect_replies").update({ processed_at: new Date().toISOString() }).eq("id", replyRowId);
    }
  };

  if (!a.prospectId) { await markProcessed(); return out; } // stored for review, nothing to update

  const { data: prospect } = await supabase
    .from("prospects")
    .select("name, status, reply_snippet")
    .eq("id", a.prospectId)
    .maybeSingle();
  if (!prospect) { await markProcessed(); return out; }
  // A prospect someone already marked "replied" by hand still gets its reply
  // text captured once; every other settled status is left alone.
  const needsBackfill = prospect.status === "replied" && !prospect.reply_snippet;
  if (!REPLYABLE_STATUSES.includes(prospect.status) && !needsBackfill) { await markProcessed(); return out; } // already handled

  if (a.isBounce) {
    out.bounced = true;
    await supabase.from("prospects").update({ status: "bounced" }).eq("id", a.prospectId);
  } else {
    out.replied = true;
    const replySnippet = a.replyBody;
    await supabase.from("prospects").update({
      status: "replied",
      replied_at: new Date().toISOString(),
      ...(replySnippet ? { reply_snippet: replySnippet } : {}),
    }).eq("id", a.prospectId);

    // Tell the client -- a reply is the whole point of outreach. Deduped per
    // prospect (notifyClientBlocked keys on title) so a redelivery never
    // re-notifies.
    const who = prospect.name ?? "A prospect";
    const preview = replySnippet ? `"${replySnippet.replace(/\s+/g, " ").slice(0, 280)}${replySnippet.length > 280 ? "…" : ""}"` : "Open your portal to read it in your inbox.";
    await notifyClientBlocked(supabase, a.clientId, {
      notificationType: "prospect_reply",
      title: `${who} replied to your outreach`,
      description: preview,
      dedupeHours: 24 * 60,
    });
    await logActivity(supabase, a.clientId, {
      type: "prospect_replied",
      title: `${who} replied to your outreach`,
      description: replySnippet ? replySnippet.slice(0, 140) : undefined,
      icon: "mail",
      metadata: { prospect_id: a.prospectId },
    });
  }
  // Stop the rest of the sequence either way.
  await supabase.from("email_queue").update({ status: "cancelled", error_message: a.isBounce ? "Prospect bounced" : "Prospect replied" })
    .filter("metadata->>prospect_id", "eq", a.prospectId).eq("status", "pending");
  await markProcessed();
  return out;
}
