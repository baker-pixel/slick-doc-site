import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkClientOrAdminAuth } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { clientIdsWithMailbox, NO_MAILBOX_MESSAGE } from "../_shared/outreachMailbox.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { logActivity } from "../_shared/activityLog.ts";
import { refreshProspectProject } from "../_shared/prospectProject.ts";
import { recentDiscoveryRun } from "../_shared/discoveryCooldown.ts";
import { validateCampaignInput } from "../_shared/campaignInput.ts";
import {
  assignWebsites,
  buildLeads,
  classifyLeads,
  type ColumnMapping,
  detectMapping,
  estimateSendDays,
  type Lead,
  leadToProspectRow,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  parseCsv,
} from "../_shared/leadImport.ts";

// Campaigns: a named batch of prospects with a topic, from an uploaded CSV
// (kind csv_list) or from AI lead discovery (kind discovery).
//
// Actions (all take client_id; callers are the client's portal users or admins):
//   preview_import           parse + validate a CSV, report what would happen. Writes nothing.
//   create_import_campaign   same checks, then create the campaign and its leads.
//   create_discovery_campaign  create a topic campaign and run lead discovery into it.
//   run_discovery            run lead discovery into an existing discovery campaign.
//   set_status               pause / resume / archive a campaign.
//
// Everything is validated here (not in the browser) so the rules can't be
// bypassed by calling the function directly. The UI only reads the file.

const CHUNK = 200; // ids per .in() lookup, keeps the request URL short
const INSERT_CHUNK = 500;
const DISCOVERY_COOLDOWN_MS = 60 * 60 * 1000; // same as client-triggered discovery

// deno-lint-ignore no-explicit-any
type Db = any;

const err = (message: string, status = 400, extra: Record<string, unknown> = {}) =>
  jsonResponse({ error: message, ...extra }, status);

const chunked = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** PostgREST caps a response at 1000 rows; page through until exhausted. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

async function lookupSuppression(supabase: Db, clientId: string, emails: string[]) {
  const existingRows = await fetchAll<{ email: string; website_url: string }>((from, to) =>
    supabase.from("prospects").select("email, website_url").eq("client_id", clientId).range(from, to)
  );
  const existing = new Set(existingRows.map((r) => (r.email ?? "").toLowerCase()).filter(Boolean));

  const unsubscribed = new Set<string>();
  const bounced = new Set<string>();
  const batches = chunked(emails, CHUNK);
  // A few lookups at a time: 5,000 leads is 25 batches x 2 tables.
  for (let i = 0; i < batches.length; i += 5) {
    await Promise.all(batches.slice(i, i + 5).map(async (batch) => {
      const [prefs, bad] = await Promise.all([
        supabase.from("email_preferences").select("email").eq("subscribed", false).in("email", batch),
        supabase.from("email_logs").select("recipient_email").in("status", ["bounced", "complained"]).in("recipient_email", batch),
      ]);
      // A failed suppression lookup must stop the import, never silently allow it.
      if (prefs.error) throw new Error(`Opt-out lookup failed: ${prefs.error.message}`);
      if (bad.error) throw new Error(`Bounce lookup failed: ${bad.error.message}`);
      for (const r of prefs.data ?? []) unsubscribed.add(String(r.email).toLowerCase());
      for (const r of bad.data ?? []) bounced.add(String(r.recipient_email).toLowerCase());
    }));
  }
  return { existing, unsubscribed, bounced, existingWebsiteUrls: existingRows.map((r) => r.website_url).filter(Boolean) };
}

interface ClientRow {
  id: string;
  business_name: string;
  tier: string | null;
  status: string;
  icp: { local?: boolean } | null;
}

interface Prepared {
  headers: string[];
  mapping: ColumnMapping;
  accepted: Lead[];
  summary: ReturnType<typeof classifyLeads>["summary"];
  existingWebsiteUrls: string[];
}

function parseMapping(raw: unknown, headerCount: number): ColumnMapping | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") return null;
  const out: ColumnMapping = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!["email", "first_name", "last_name", "full_name", "company", "website", "title", "city", "note"].includes(k)) continue;
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n >= headerCount) return null;
    out[k as keyof ColumnMapping] = n;
  }
  return out;
}

async function prepareImport(
  supabase: Db,
  client: ClientRow,
  body: Record<string, unknown>,
  isAdmin: boolean,
): Promise<{ response: Response } | { needsMapping: { headers: string[]; mapping: ColumnMapping; sample: string[][] } } | { prepared: Prepared }> {
  const csv = typeof body.csv === "string" ? body.csv : "";
  if (!csv.trim()) return { response: err("Choose a CSV file first.") };
  if (new TextEncoder().encode(csv).length > MAX_IMPORT_BYTES) {
    return { response: err(`That file is too large (limit ${MAX_IMPORT_BYTES / 1024 / 1024} MB).`, 413) };
  }

  const rows = parseCsv(csv);
  if (rows.length < 2) return { response: err("The file has no contact rows. The first row must be column headers.") };

  const headers = rows[0].map((h) => h.trim());
  const given = parseMapping(body.mapping, headers.length);
  if (body.mapping !== undefined && body.mapping !== null && given === null) {
    return { response: err("Invalid column mapping.") };
  }
  const mapping = given ?? detectMapping(headers);
  if (mapping.email === undefined) {
    return { needsMapping: { headers, mapping, sample: rows.slice(1, 4) } };
  }

  const policy = tierPolicy(client.tier).prospect;
  const dataRows = rows.slice(1);
  const limit = isAdmin ? MAX_IMPORT_ROWS : Math.min(MAX_IMPORT_ROWS, policy.maxListSize);
  if (dataRows.length > limit) {
    return { response: err(`This list has ${dataRows.length.toLocaleString()} contacts; your plan allows up to ${limit.toLocaleString()} per upload.`, 413) };
  }

  const { leads, rejected } = buildLeads(dataRows, mapping);
  const suppression = await lookupSuppression(supabase, client.id, [...new Set(leads.map((l) => l.email))]);
  const { accepted, summary } = classifyLeads(leads, rejected, suppression);
  return { prepared: { headers, mapping, accepted, summary, existingWebsiteUrls: suppression.existingWebsiteUrls } };
}

/** Runs lead discovery into a campaign using the client's own pipeline functions. */
async function runDiscovery(client: ClientRow, campaignId: string, maxResults: number): Promise<Record<string, unknown>> {
  const fn = client.icp?.local === false ? "discover-prospects-web" : "discover-prospects";
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({
      client_id: client.id,
      campaign_id: campaignId,
      max_results: maxResults,
      password: Deno.env.get("ADMIN_PASSWORD"),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) return { ok: false, error: data.error ?? `Discovery failed (${res.status})` };
  return { ok: true, discovered: data.discovered ?? 0 };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = body.action;
    const clientId = body.client_id;
    if (typeof clientId !== "string" || !clientId) return err("client_id is required");

    const auth = await checkClientOrAdminAuth(req, supabase, clientId, typeof body.password === "string" ? body.password : null);
    if (!auth.authorized) return err("Unauthorized", 401);
    const isAdmin = auth.role === "admin";

    const { data: clientRow, error: clientErr } = await supabase
      .from("client_accounts")
      .select("id, business_name, tier, status, icp")
      .eq("id", clientId)
      .maybeSingle();
    if (clientErr || !clientRow) return err("Client not found", 404);
    const client = clientRow as ClientRow;
    const policy = tierPolicy(client.tier).prospect;

    // ── set_status: allowed regardless of tier/mailbox (you can always stop) ──
    if (action === "set_status") {
      const status = body.status;
      if (!["active", "paused", "archived"].includes(status as string)) return err("status must be active, paused or archived");
      if (typeof body.campaign_id !== "string") return err("campaign_id is required");

      const { data: campaign } = await supabase
        .from("prospect_campaigns").select("id, client_id, name, status").eq("id", body.campaign_id).maybeSingle();
      if (!campaign || campaign.client_id !== clientId) return err("Campaign not found", 404);
      if (campaign.status === "archived") return err("This campaign is archived.");

      if (status === "active" && client.status !== "active") return err("This account's automation is paused.", 403);

      const { error: upErr } = await supabase
        .from("prospect_campaigns").update({ status, updated_at: new Date().toISOString() }).eq("id", campaign.id);
      if (upErr) throw upErr;

      let cancelled = 0;
      if (status === "archived") {
        // Archiving is final: cancel everything not yet sent. (Pausing instead
        // leaves rows pending; the sender holds them while the campaign is paused.)
        const ids = (await fetchAll<{ id: string }>((from, to) =>
          supabase.from("prospects").select("id").eq("campaign_id", campaign.id).range(from, to)
        )).map((p) => p.id);
        for (const batch of chunked(ids, 100)) {
          const { data: done } = await supabase
            .from("email_queue")
            .update({ status: "cancelled", error_message: "Campaign archived" })
            .eq("status", "pending")
            .in("metadata->>prospect_id", batch)
            .select("id");
          cancelled += done?.length ?? 0;
        }
      }
      await logActivity(supabase, clientId, {
        type: "campaign_status",
        title: `Campaign "${campaign.name}" ${status === "active" ? "resumed" : status}`,
        icon: "mail",
        metadata: { campaign_id: campaign.id, status, cancelled },
      });
      return jsonResponse({ ok: true, status, cancelled_emails: cancelled });
    }

    // ── everything below creates or feeds a campaign ──────────────────────────
    if (client.status !== "active") return err("This account's automation is paused.", 403);
    if (!policy.enabled) return err("Your plan doesn't include lead outreach.", 403);
    if (!(await clientIdsWithMailbox(supabase, [clientId])).has(clientId)) {
      return err(NO_MAILBOX_MESSAGE, 403, { code: "no_mailbox" });
    }

    if (action === "preview_import" || action === "create_import_campaign") {
      if (!policy.listUpload && !isAdmin) {
        return err("Uploading your own contact list isn't included in your plan.", 403, { code: "tier_locked" });
      }

      // The preview runs while the user is still filling in the form, so it
      // only needs the email count per contact; full validation happens on create.
      const rawCampaign = (body.campaign && typeof body.campaign === "object" ? body.campaign : {}) as Record<string, unknown>;
      const campaignInput = validateCampaignInput(
        action === "preview_import"
          ? { name: "preview", audience: rawCampaign.audience, topic: "preview", max_steps: rawCampaign.max_steps }
          : body.campaign,
      );
      if (!campaignInput.ok) return err(campaignInput.error);
      const campaign = campaignInput.value;

      const prep = await prepareImport(supabase, client, body, isAdmin);
      if ("response" in prep) return prep.response;
      if ("needsMapping" in prep) {
        return jsonResponse({ needs_mapping: true, ...prep.needsMapping });
      }
      const { prepared } = prep;
      const dailyCap = policy.dailySendCap;
      const totalEmails = prepared.accepted.length * campaign.max_steps;

      if (action === "preview_import") {
        return jsonResponse({
          headers: prepared.headers,
          mapping: prepared.mapping,
          summary: prepared.summary,
          sample: prepared.accepted.slice(0, 5),
          daily_cap: dailyCap,
          total_emails: totalEmails,
          estimated_days: dailyCap > 0 ? estimateSendDays(totalEmails, dailyCap) : null,
        });
      }

      // ── create_import_campaign ──
      if (body.consent !== true) {
        return err("Please confirm you have permission to contact everyone on this list.");
      }
      if (prepared.accepted.length === 0) {
        return err("There are no new contacts to import. Everyone in the file was invalid, a duplicate, already in your pipeline, or opted out.");
      }

      const now = new Date().toISOString();
      const approvedBy = auth.userId ?? "admin";
      const { data: created, error: createErr } = await supabase
        .from("prospect_campaigns")
        .insert({
          client_id: clientId,
          name: campaign.name,
          kind: "csv_list",
          audience: campaign.audience,
          topic: campaign.topic,
          topic_details: campaign.topic_details,
          max_steps: campaign.max_steps,
          status: "active",
          source_filename: typeof body.filename === "string" ? body.filename.slice(0, 200) : null,
          consent_at: now,
          consent_by: auth.userId,
          created_by: auth.userId,
        })
        .select("id")
        .single();
      if (createErr || !created) throw createErr ?? new Error("Could not create campaign");

      const websites = assignWebsites(prepared.accepted, prepared.existingWebsiteUrls);
      const rows = prepared.accepted.map((lead) =>
        leadToProspectRow(lead, {
          clientId, campaignId: created.id, website: websites.get(lead.email) ?? "", approvedAt: now, approvedBy,
        })
      );

      let imported = 0;
      let skippedConflict = 0;
      try {
        for (const batch of chunked(rows, INSERT_CHUNK)) {
          const { error: insErr } = await supabase.from("prospects").insert(batch);
          if (!insErr) { imported += batch.length; continue; }
          if (insErr.code !== "23505") throw insErr;
          // A concurrent import or discovery raced us on a unique key: fall back to row-by-row.
          for (const row of batch) {
            const { error: oneErr } = await supabase.from("prospects").insert(row);
            if (!oneErr) imported++;
            else if (oneErr.code === "23505") skippedConflict++;
            else throw oneErr;
          }
        }
      } catch (e) {
        // Leave nothing half-imported: a campaign that is a random prefix of the list is worse than none.
        await supabase.from("prospects").delete().eq("campaign_id", created.id);
        await supabase.from("prospect_campaigns").delete().eq("id", created.id);
        throw e;
      }

      await supabase.from("prospect_campaigns").update({
        import_summary: { ...prepared.summary, imported, skipped_conflict: skippedConflict },
        updated_at: new Date().toISOString(),
      }).eq("id", created.id);

      await logActivity(supabase, clientId, {
        type: "campaign_created",
        title: `Campaign "${campaign.name}" started`,
        description: `${imported} contacts imported from ${typeof body.filename === "string" ? body.filename : "a CSV file"}`,
        icon: "mail",
        metadata: { campaign_id: created.id, imported },
      });
      try { await refreshProspectProject(supabase, clientId); } catch (e) { console.error("refreshProspectProject failed:", e); }

      return jsonResponse({
        ok: true,
        campaign_id: created.id,
        imported,
        summary: prepared.summary,
        daily_cap: dailyCap,
        estimated_days: dailyCap > 0 ? estimateSendDays(imported * campaign.max_steps, dailyCap) : null,
      });
    }

    if (action === "create_discovery_campaign" || action === "run_discovery") {
      let campaignId: string;
      let created = false;
      if (action === "run_discovery") {
        if (typeof body.campaign_id !== "string") return err("campaign_id is required");
        const { data: existing } = await supabase
          .from("prospect_campaigns").select("id, client_id, kind, status").eq("id", body.campaign_id).maybeSingle();
        if (!existing || existing.client_id !== clientId) return err("Campaign not found", 404);
        if (existing.kind !== "discovery") return err("Only discovery campaigns can find new leads.");
        if (existing.status !== "active") return err(`Campaign is ${existing.status}.`);
        campaignId = existing.id;
      } else {
        const parsed = validateCampaignInput({ ...(body.campaign as object), audience: "cold" });
        if (!parsed.ok) return err(parsed.error);
        const c = parsed.value;
        const { data: row, error: insErr } = await supabase
          .from("prospect_campaigns")
          .insert({
            client_id: clientId, name: c.name, kind: "discovery", audience: "cold", topic: c.topic,
            topic_details: c.topic_details, max_steps: c.max_steps, status: "active", created_by: auth.userId,
          })
          .select("id").single();
        if (insErr || !row) throw insErr ?? new Error("Could not create campaign");
        campaignId = row.id;
        created = true;
      }

      // The campaign exists either way; if discovery can't run right now
      // (cooldown / provider error) the client can run it again from the list.
      if (!isAdmin && await recentDiscoveryRun(supabase, clientId, DISCOVERY_COOLDOWN_MS)) {
        return jsonResponse({
          ok: true, campaign_id: campaignId, created,
          discovery: { ok: false, error: "Lead discovery ran recently. Try again in about an hour." },
        });
      }
      const discovery = await runDiscovery(client, campaignId, policy.discoveryBatch);
      return jsonResponse({ ok: true, campaign_id: campaignId, created, discovery });
    }

    return err(`Unknown action: ${String(action)}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Unknown error";
    console.error("prospect-campaign error:", msg);
    return err(msg, 500);
  }
});
