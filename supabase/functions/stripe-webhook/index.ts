import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { jsonResponse, errorResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { refundInvoice, stripeRequest, tierForPriceId, verifyStripeSignature } from "../_shared/stripe.ts";
import { decideClaim, isDuplicateSubscription } from "../_shared/stripeDedupe.ts";
import { logAlert } from "../_shared/alerts.ts";
import { applyBillingDecision } from "../_shared/billingGate.ts";
import { sendPaymentFailedEmail, sendServicesPausedEmail } from "../_shared/billingEmail.ts";

// Stripe -> our DB. Verified by signature (verify_jwt = false in config.toml).
// Every event id is recorded in stripe_events first, so Stripe's retries are
// idempotent; if processing throws, the marker is removed so the retry runs.

type Supabase = ReturnType<typeof serviceClient>;

const SUB_STATUSES = new Set(["incomplete", "trialing", "active", "past_due", "unpaid", "canceled", "paused"]);

function mapSubStatus(s: string): string {
  if (s === "incomplete_expired") return "canceled";
  return SUB_STATUSES.has(s) ? s : "none";
}

const isoFromUnix = (n: unknown) => (typeof n === "number" ? new Date(n * 1000).toISOString() : null);

async function findAccount(supabase: Supabase, opts: { clientId?: string | null; customerId?: string | null }) {
  const cols =
    "id, email, first_name, business_name, status, tier, stripe_subscription_id, subscription_status, payment_failed_at";
  if (opts.clientId) {
    const { data } = await supabase.from("client_accounts").select(cols).eq("id", opts.clientId).maybeSingle();
    if (data) return data;
  }
  if (opts.customerId) {
    const { data } = await supabase.from("client_accounts").select(cols).eq("stripe_customer_id", opts.customerId)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

async function syncSubscription(supabase: Supabase, sub: any) {
  const acct = await findAccount(supabase, {
    clientId: sub.metadata?.client_account_id,
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
  });
  if (!acct) {
    console.warn("stripe-webhook: no client for subscription", sub.id);
    return;
  }

  const status = mapSubStatus(sub.status);

  // A late event for a replaced (older) subscription must not clobber the
  // current one.
  if (
    acct.stripe_subscription_id && acct.stripe_subscription_id !== sub.id &&
    (status === "canceled" || status === "unpaid" || status === "incomplete")
  ) {
    console.log("stripe-webhook: ignoring stale subscription event", sub.id);
    return;
  }

  if (isDuplicateSubscription(acct, { id: sub.id, status })) {
    await resolveDuplicateSubscription(supabase, acct, sub);
    return;
  }

  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id ?? null;
  const tier = tierForPriceId(priceId);
  const periodEnd = sub.current_period_end ?? item?.current_period_end;

  const update: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    subscription_status: status,
    stripe_price_id: priceId,
    current_period_end: isoFromUnix(periodEnd),
    cancel_at_period_end: !!sub.cancel_at_period_end,
  };
  if (tier) {
    update.tier = tier;
    update.plan_tier = tier;
  }
  if (status === "past_due") {
    if (!acct.payment_failed_at) update.payment_failed_at = new Date().toISOString();
  } else if (status === "active" || status === "trialing") {
    update.payment_failed_at = null;
  }

  const { error } = await supabase.from("client_accounts").update(update).eq("id", acct.id);
  if (error) throw error;

  await enforce(supabase, acct);
}

/**
 * The client paid twice (two checkout sessions both completed). Keep the
 * original subscription; cancel the newer one so it never bills again, refund
 * what it just charged, and alert an admin so nothing is silent.
 */
async function resolveDuplicateSubscription(supabase: Supabase, acct: any, sub: any) {
  console.warn(`stripe-webhook: duplicate subscription ${sub.id} for client ${acct.id}; cancelling + refunding`);

  await stripeRequest("DELETE", `/subscriptions/${sub.id}`).catch((e) => {
    // Already cancelled by an earlier delivery is fine; anything else surfaces below.
    if (!String(e?.message ?? e).includes("resource_missing")) console.error("cancel duplicate failed:", e);
  });

  let refundId: string | null = null;
  let refundError: string | null = null;
  try {
    const invoices = await stripeRequest<{ data: Array<{ id: string }> }>("GET", "/invoices", {
      subscription: sub.id,
      limit: 1,
    });
    const invoiceId = invoices.data[0]?.id;
    if (invoiceId) refundId = await refundInvoice(invoiceId, "duplicate");
  } catch (e) {
    refundError = String((e as Error)?.message ?? e);
  }

  await logAlert(supabase, {
    source: "stripe-webhook",
    alertType: "duplicate_payment",
    severity: refundId ? "high" : "critical",
    title: `Duplicate payment ${refundId ? "refunded" : "NEEDS MANUAL REFUND"}: ${acct.business_name}`,
    message: refundId
      ? `${acct.business_name} paid for a second subscription (${sub.id}). It was cancelled and refunded (${refundId}); the original subscription is unchanged.`
      : `${acct.business_name} paid for a second subscription (${sub.id}). It was cancelled but the refund could not be completed${refundError ? `: ${refundError}` : ""}. Refund it manually in Stripe.`,
    sourceId: acct.id,
    metadata: { duplicate_subscription: sub.id, original_subscription: acct.stripe_subscription_id, refund_id: refundId },
  });
}

/** Apply pause/resume and tell the client when we just paused them. */
async function enforce(supabase: Supabase, acct: { id: string; email: string; first_name: string | null }) {
  const decision = await applyBillingDecision(supabase, acct.id);
  if (decision === "pause") {
    await sendServicesPausedEmail(acct.email, acct.first_name).catch((e) => console.error("paused email failed:", e));
  }
}

function invoiceStatus(inv: any): string | null {
  switch (inv.status) {
    case "paid":
      return "paid";
    case "open":
      return (inv.attempt_count ?? 0) > 0 ? "failed" : "pending";
    case "void":
    case "uncollectible":
      return "void";
    default:
      return null; // draft
  }
}

async function upsertInvoice(supabase: Supabase, inv: any) {
  const status = invoiceStatus(inv);
  if (!status) return null;

  const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
  let acct = await findAccount(supabase, { customerId });
  if (!acct && customerId) {
    // Invoice events can beat the customer-id link; the customer's metadata
    // carries our client id.
    const customer = await stripeRequest("GET", `/customers/${customerId}`);
    acct = await findAccount(supabase, { clientId: customer?.metadata?.client_account_id });
    if (acct) {
      await supabase.from("client_accounts").update({ stripe_customer_id: customerId }).eq("id", acct.id)
        .is("stripe_customer_id", null);
    }
  }
  if (!acct) {
    console.warn("stripe-webhook: no client for invoice", inv.id);
    return null;
  }

  const lines = (inv.lines?.data ?? []).map((l: any) => {
    const qty = l.quantity ?? 1;
    const total = (l.amount ?? 0) / 100;
    return { description: l.description ?? "Subscription", quantity: qty, unit_price: total / qty, total };
  });
  const dueUnix = inv.due_date ?? inv.created;
  const paidAt = inv.status_transitions?.paid_at;

  const { error } = await supabase.from("client_invoices").upsert({
    client_account_id: acct.id,
    stripe_invoice_id: inv.id,
    invoice_number: inv.number ?? `STRIPE-${String(inv.id).slice(-10).toUpperCase()}`,
    amount: ((status === "paid" ? inv.amount_paid : inv.amount_due) ?? inv.total ?? 0) / 100,
    currency: (inv.currency ?? "usd").toUpperCase(),
    status,
    due_date: new Date((dueUnix ?? Date.now() / 1000) * 1000).toISOString().slice(0, 10),
    paid_at: isoFromUnix(paidAt),
    stripe_payment_intent_id: typeof inv.payment_intent === "string" ? inv.payment_intent : null,
    description: inv.description ?? lines[0]?.description ?? null,
    line_items: { items: lines },
    hosted_invoice_url: inv.hosted_invoice_url ?? null,
    invoice_pdf_url: inv.invoice_pdf ?? null,
    attempt_count: inv.attempt_count ?? 0,
    next_payment_attempt: isoFromUnix(inv.next_payment_attempt),
  }, { onConflict: "stripe_invoice_id" });
  if (error) throw error;
  return acct;
}

async function onPaymentFailed(supabase: Supabase, inv: any) {
  const acct = await upsertInvoice(supabase, inv);
  if (!acct) return;
  // The grace clock starts at the first failure; later retries don't reset it.
  if (!acct.payment_failed_at) {
    await supabase.from("client_accounts").update({
      payment_failed_at: new Date().toISOString(),
      subscription_status: "past_due",
    }).eq("id", acct.id).in("subscription_status", ["active", "trialing", "past_due"]);
  }
  // Email on the first attempt only (subscription.updated may have stamped
  // payment_failed_at before this event arrived, so key off attempt_count).
  if ((inv.attempt_count ?? 1) <= 1) {
    await sendPaymentFailedEmail(acct.email, acct.first_name).catch((e) => console.error("failed-payment email:", e));
  }
}

async function onCheckoutCompleted(supabase: Supabase, session: any) {
  if (session.mode !== "subscription" || !session.subscription) return;
  const clientId = session.client_reference_id ?? session.metadata?.client_account_id;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const acct = await findAccount(supabase, { clientId, customerId });
  if (!acct) {
    console.warn("stripe-webhook: checkout with no matching client", session.id);
    return;
  }

  if (customerId) {
    const { error } = await supabase.from("client_accounts").update({ stripe_customer_id: customerId }).eq("id", acct.id);
    if (error) throw error;
  }

  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
  const sub = await stripeRequest("GET", `/subscriptions/${subId}`);
  await syncSubscription(supabase, sub);

  // Self-serve signup: payment replaces manual approval.
  if (acct.status === "pending") await activatePaidSignup(supabase, acct);
}

/**
 * Same steps an admin triggers in approveSignup(): activate, seed the
 * onboarding workflow, generate projects, send the portal invite.
 */
async function activatePaidSignup(supabase: Supabase, acct: any) {
  const { data: flipped, error } = await supabase
    .from("client_accounts")
    .update({ status: "active" })
    .eq("id", acct.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!flipped) return; // another delivery already activated it

  const tier = acct.tier;
  const steps: Array<[string, Record<string, unknown>]> = [
    ["seed-tier-workflow", { client_id: acct.id, tier }],
    ["generate-client-projects", { clientAccountId: acct.id, returnOnly: false }],
  ];
  for (const [fn, body] of steps) {
    const { error: e } = await supabase.functions.invoke(fn, { body });
    if (e) console.error(`stripe-webhook: ${fn} failed for ${acct.id}:`, e);
  }

  const { data: invitation, error: invErr } = await supabase
    .from("client_invitations")
    .insert({ client_account_id: acct.id, email: acct.email, first_name: acct.first_name, invited_by: "Stripe checkout" })
    .select("id, token")
    .single();
  if (invErr) throw invErr;

  const { error: sendErr } = await supabase.functions.invoke("send-client-invite", {
    body: {
      invitationId: invitation.id,
      email: acct.email,
      firstName: acct.first_name || "there",
      businessName: acct.business_name,
      token: invitation.token,
    },
  });
  if (sendErr) console.error("stripe-webhook: send-client-invite failed:", sendErr);
}

async function handleEvent(supabase: Supabase, event: any) {
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
      return onCheckoutCompleted(supabase, obj);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return syncSubscription(supabase, obj);
    case "invoice.finalized":
    case "invoice.updated":
    case "invoice.voided":
    case "invoice.marked_uncollectible":
      await upsertInvoice(supabase, obj);
      return;
    case "invoice.paid": {
      const acct = await upsertInvoice(supabase, obj);
      if (acct) {
        await supabase.from("client_accounts").update({ payment_failed_at: null }).eq("id", acct.id);
      }
      return;
    }
    case "invoice.payment_failed":
      return onPaymentFailed(supabase, obj);
    default:
      return;
  }
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return errorResponse("STRIPE_WEBHOOK_SECRET not configured", 500);

  const raw = await req.text();
  const valid = await verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret);
  if (!valid) return errorResponse("Invalid signature", 400);

  const event = JSON.parse(raw);
  const supabase = serviceClient();

  // Claim the event id. A repeat id is a duplicate (already completed), an
  // in-flight delivery (ask Stripe to retry later), or a claim whose earlier
  // attempt died before finishing (take it over rather than lose the event).
  const { error: claimErr } = await supabase.from("stripe_events").insert({ id: event.id, type: event.type });
  if (claimErr) {
    if (claimErr.code !== "23505") return errorResponse(claimErr, 500);

    const { data: existing } = await supabase
      .from("stripe_events")
      .select("completed_at, processed_at")
      .eq("id", event.id)
      .maybeSingle();
    const decision = decideClaim(existing);
    if (decision === "duplicate") return jsonResponse({ received: true, duplicate: true });
    if (decision === "in_progress") return jsonResponse({ error: "event in progress" }, 409);
    if (decision === "take_over") {
      // Optimistic takeover: only one retry wins the stale claim.
      const { data: won } = await supabase
        .from("stripe_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", event.id)
        .is("completed_at", null)
        .eq("processed_at", existing!.processed_at)
        .select("id")
        .maybeSingle();
      if (!won) return jsonResponse({ error: "event in progress" }, 409);
    }
  }

  try {
    await handleEvent(supabase, event);
    await supabase.from("stripe_events").update({ completed_at: new Date().toISOString() }).eq("id", event.id);
    return jsonResponse({ received: true });
  } catch (err) {
    console.error(`stripe-webhook: ${event.type} (${event.id}) failed:`, err);
    await supabase.from("stripe_events").delete().eq("id", event.id); // let Stripe retry
    return errorResponse(err, 500);
  }
});
