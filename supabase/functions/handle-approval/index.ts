import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isServiceRequest } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI, callAIJson, MODELS, NO_FABRICATION_GUARDRAIL } from "../_shared/ai.ts";
import { isUsableCaption } from "../_shared/captionGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { approval_id, action, feedback, image_feedback, password } = await req.json();

    if (!approval_id || !action) {
      return new Response(
        JSON.stringify({ error: "approval_id and action are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["approved", "changes_requested", "rejected"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "action must be 'approved', 'changes_requested', or 'rejected'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the approval row
    const { data: approval, error: fetchErr } = await supabase
      .from("content_approvals")
      .select("*")
      .eq("id", approval_id)
      .single();

    if (fetchErr || !approval) {
      return new Response(
        JSON.stringify({ error: "Approval not found", details: fetchErr?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientId = approval.client_account_id;

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: "Approval has no associated client account" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authorization: server (service key), admin panel (ADMIN_PASSWORD), or a
    // portal user who owns this approval's client account. Without this check
    // anyone with the anon key could approve and publish arbitrary content.
    const bearer = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
    const isServer = isServiceRequest(req);
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    const isAdminCall = !!adminPassword && password === adminPassword;

    if (!isServer && !isAdminCall) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${bearer}` } } }
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: portalUser } = await supabase
        .from("client_portal_users")
        .select("id")
        .eq("user_id", user.id)
        .eq("client_account_id", clientId)
        .maybeSingle();

      if (!portalUser) {
        const { data: isAdmin } = await supabase.rpc("has_role", { _role: "admin", _user_id: user.id });
        if (isAdmin !== true) {
          return new Response(
            JSON.stringify({ error: "Forbidden" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    if (action === "approved") {
      // Caption gate: an empty/placeholder post must never be approved into the publish queue.
      if (!isUsableCaption(approval.full_content) && !isUsableCaption(approval.content_preview)) {
        return new Response(
          JSON.stringify({ error: "This post has no caption yet, so it can't be approved. We're regenerating it." }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Update approval status
      await supabase
        .from("content_approvals")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          publish_status: "queued",
          reviewed_at: new Date().toISOString(),
          feedback: feedback || null,
        })
        .eq("id", approval_id);

      // 2. Bridge: promote content into content_calendar with client_approved = true.
      // content_calendar.content_id is a FK to generated_content(id), not content_approvals.
      const generatedContentId: string | null = approval.content_id || null;
      const scheduledFor = approval.scheduled_for || new Date().toISOString();

      // When the draft came from fill-scheduled-content there is an original placeholder
      // slot in content_calendar. Prefer updating that slot over inserting a new row so
      // we don't end up with two calendar entries for the same piece of content.
      let slotUpdated = false;

      if (generatedContentId) {
        // Fetch the generated_content row to retrieve the original slot id from metadata.
        // Single PK lookup — maybeSingle() is safe here (no duplicate risk on id).
        const { data: genRecord } = await supabase
          .from("generated_content")
          .select("metadata")
          .eq("id", generatedContentId)
          .maybeSingle();

        const genMeta = (genRecord?.metadata) as Record<string, unknown> | null;
        const slotId = genMeta?.content_calendar_slot_id as string | undefined;

        if (slotId) {
          // Fetch existing slot metadata first so we can merge rather than overwrite.
          // Filter by status=draft at fetch time — same guard as the update below.
          const { data: existingSlot } = await supabase
            .from("content_calendar")
            .select("metadata")
            .eq("id", slotId)
            .eq("status", "draft")
            .maybeSingle(); // safe: PK + status filter = at most one row

          const existingMeta = (existingSlot?.metadata as Record<string, unknown>) || {};

          // Return the updated row so we can confirm at least one row matched.
          // Supabase returns no error when 0 rows match a filtered update,
          // so we check the returned array length instead.
          const { data: updatedRows, error: slotUpdateErr } = await supabase
            .from("content_calendar")
            .update({
              content: approval.full_content || approval.content_preview || "",
              title: approval.title || "",
              status: "scheduled",
              client_approved: true,
              content_id: generatedContentId,
              metadata: {
                ...existingMeta,
                source: "content_approvals",
                content_approval_id: approval_id,
                generated_content_id: generatedContentId,
              },
            })
            .eq("id", slotId)
            .eq("status", "draft") // only update if still a draft — prevents double-fire
            .select("id");

          if (slotUpdateErr) {
            console.error("Failed to update original calendar slot:", slotUpdateErr);
          } else if (updatedRows && updatedRows.length > 0) {
            slotUpdated = true;
            console.log(`Updated original slot ${slotId} to scheduled`);
          } else {
            console.log(`Slot ${slotId} not found or already past draft — falling back to insert path`);
          }
        }
      }

      // No original slot to update — guard against duplicates then insert a new row.
      if (!slotUpdated) {
        // Use limit(1) + array check instead of maybeSingle() to be safe against existing duplicates
        const { data: existingRows } = await supabase
          .from("content_calendar")
          .select("id")
          .or(
            generatedContentId
              ? `content_id.eq.${generatedContentId},metadata->>content_approval_id.eq.${approval_id}`
              : `metadata->>content_approval_id.eq.${approval_id}`
          )
          .neq("status", "draft")
          .limit(1);

        if (!existingRows || existingRows.length === 0) {
          const { error: calInsertError } = await supabase
            .from("content_calendar")
            .insert({
              client_account_id: clientId,
              content_id: generatedContentId,
              content_type: approval.content_type,
              platform: approval.platform || null,
              content: approval.full_content || approval.content_preview || "",
              title: approval.title || "",
              status: "scheduled",
              client_approved: true,
              scheduled_for: scheduledFor,
              metadata: {
                source: "content_approvals",
                content_approval_id: approval_id,
              },
            });

          if (calInsertError) {
            console.error("Failed to insert content_calendar row:", calInsertError);
          }
        }
      }

      // Sync status back to generated_content so admin sees client approved
      if (generatedContentId) {
        await supabase
          .from("generated_content")
          .update({ status: "client_approved", updated_at: new Date().toISOString() })
          .eq("id", generatedContentId);
      }

      // Advance client_approval workflow step if still pending (handles admin-triggered approvals)
      try {
        const { data: wf } = await supabase
          .from("client_workflows")
          .select("id")
          .eq("client_id", clientId)
          .eq("status", "active")
          .maybeSingle();

        if (wf) {
          const { data: approvalStep } = await supabase
            .from("workflow_steps")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("workflow_id", wf.id)
            .eq("task_type", "client_approval")
            .eq("status", "pending")
            .select("id, step_number")
            .maybeSingle();

          if (approvalStep) {
            const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
            const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
            fetch(`${supabaseUrl}/functions/v1/advance-workflow`, {
              method: "POST",
              headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                workflow_id: wf.id,
                completed_step_number: approvalStep.step_number,
                client_id: clientId,
              }),
            }).catch((e) => console.error("advance-workflow after approval:", e));
          }
        }
      } catch (e) {
        console.error("Failed to advance workflow after approval:", e);
      }

      // Log activity
      await supabase.from("activity_feed").insert({
        client_account_id: clientId,
        activity_type: "content_approved",
        title: `Content approved: ${approval.title}`,
        description: `${approval.content_type} approved and queued for publishing`,
        icon: "check-circle",
        metadata: { approval_id, content_type: approval.content_type },
      });

      return new Response(
        JSON.stringify({ success: true, action: "approved", publish_status: "queued" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "rejected") {
      // A flat decline, distinct from "changes_requested": no feedback to act
      // on, so no AI rewrite -- just mark it dead. Feedback is optional here
      // (unlike changes_requested, which needs real text to rewrite from).
      await supabase
        .from("content_approvals")
        .update({
          status: "rejected",
          publish_status: "rejected",
          feedback: feedback?.trim() || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", approval_id);

      const generatedContentIdForReject: string | null = approval.content_id || null;
      if (generatedContentIdForReject) {
        await supabase
          .from("generated_content")
          .update({
            status: "rejected",
            rejection_reason: feedback?.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", generatedContentIdForReject);
      }

      await supabase.from("activity_feed").insert({
        client_account_id: clientId,
        activity_type: "content_rejected",
        title: `Content rejected: ${approval.title}`,
        description: feedback?.trim() || "Declined, no reason given.",
        icon: "x-circle",
        metadata: { approval_id, content_type: approval.content_type },
      });

      return new Response(
        JSON.stringify({ success: true, action: "rejected" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // action === "changes_requested"
    const textFeedback = typeof feedback === "string" ? feedback.trim() : "";
    const imageFeedback = typeof image_feedback === "string" ? image_feedback.trim() : "";
    if (!textFeedback && !imageFeedback) {
      return new Response(
        JSON.stringify({ error: "Feedback is required when requesting changes" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const combinedFeedback = [textFeedback, imageFeedback ? `Image: ${imageFeedback}` : ""].filter(Boolean).join("\n\n");

    // 1. Update approval
    await supabase
      .from("content_approvals")
      .update({
        status: "changes_requested",
        publish_status: "changes_requested",
        feedback: combinedFeedback,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", approval_id);

    const generatedContentIdForChanges: string | null = approval.content_id || null;
    let revised = false;
    let failed = false;
    let newText: string | null = null;

    // 2. Image feedback: clear the old image and queue a fresh one that follows
    // the client's note. sync-fill-missing-images generates it immediately
    // because the approval is back in the client's queue (see step 4).
    if (imageFeedback) {
      const { data: slots } = await supabase
        .from("content_calendar")
        .select("id, platform, metadata")
        .eq("client_account_id", clientId)
        .or(generatedContentIdForChanges
          ? `content_id.eq.${generatedContentIdForChanges},metadata->>content_approval_id.eq.${approval_id}`
          : `metadata->>content_approval_id.eq.${approval_id}`);
      const mine = (slots || []).filter((c: any) => !approval.platform || !c.platform || c.platform === approval.platform);
      for (const c of mine as any[]) {
        const { image_url: _i, image_skip: _s, image_batch_id: _b, image_batch_status: _bs, ...rest } = (c.metadata || {}) as Record<string, unknown>;
        await supabase.from("content_calendar").update({ metadata: { ...rest, image_feedback: imageFeedback } }).eq("id", c.id);
      }
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-fill-missing-images`, {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, force: true }),
      }).catch((e) => console.error("image regeneration kick failed:", e));
    }

    // 3. Text feedback: rewrite this specific post with AI right now, and learn
    // any standing rules ("never use em dashes") so future drafts follow them
    // too. A failed rewrite falls back to flagging it for a human, so a
    // transient model error never silently eats the client's feedback.
    if (textFeedback && generatedContentIdForChanges) {
      try {
        const [{ data: genRecord }, { data: client }] = await Promise.all([
          supabase.from("generated_content").select("metadata").eq("id", generatedContentIdForChanges).maybeSingle(),
          supabase.from("client_accounts").select("business_name, industry, context_profile").eq("id", clientId).maybeSingle(),
        ]);

        // Standing rules first, so the rewrite below already obeys them.
        let learnedRules: string[] = [];
        try {
          const out = await callAIJson<{ rules?: string[] }>({
            prompt: `A client gave this feedback on a draft social post:\n"${textFeedback}"\n\nExtract ONLY instructions that should apply to ALL future posts (banned words or punctuation, mandated wording or facts). Exclude edits specific to this one post. Write each as a short directive starting with "Never" or "Always". Return JSON: {"rules": ["..."]} (empty array if none, max 5).`,
            model: MODELS.default,
            maxTokens: 300,
            source: "handle-approval-rules",
            clientId,
          });
          learnedRules = (out?.rules ?? []).filter((r) => typeof r === "string" && r.trim()).map((r) => r.trim()).slice(0, 5);
        } catch (e) {
          console.error("Standing-rule extraction failed (non-fatal):", e);
        }

        const cp = (client?.context_profile ?? {}) as Record<string, unknown>;
        let neverSay = Array.isArray(cp.never_say) ? (cp.never_say as string[]) : [];
        const fresh = learnedRules.filter((r) => !neverSay.some((e) => e.toLowerCase() === r.toLowerCase()));
        if (fresh.length) {
          neverSay = [...neverSay, ...fresh];
          await supabase.from("client_accounts").update({ context_profile: { ...cp, never_say: neverSay } }).eq("id", clientId);
        }

        const original = approval.full_content || approval.content_preview || "";
        const vf = Array.isArray(cp.verified_facts) ? (cp.verified_facts as string[]) : [];
        const prompt = `You wrote this ${approval.content_type || "social"} post${approval.platform ? ` for ${approval.platform}` : ""} for ${client?.business_name || "the business"}${client?.industry ? ` (${client.industry} industry)` : ""}:

"""
${original}
"""

The client reviewed it and requested changes:
"${textFeedback}"

${vf.length ? `Verified facts about the business (the only source for product claims): ${vf.join("; ")}.\n` : ""}${neverSay.length ? `Never say or imply (standing rules, always obey): ${neverSay.join("; ")}.\n` : ""}Rewrite the post to directly address this feedback. Keep the same topic, platform conventions, and roughly the same length. Return ONLY the revised post content -- no preamble, no explanation, no quotes.${NO_FABRICATION_GUARDRAIL}`;

        newText = (await callAI({
          prompt,
          model: MODELS.default,
          maxTokens: 600,
          source: "handle-approval-regenerate",
          clientId,
          promptId: "content-revision.v1",
        })).trim();

        await supabase
          .from("generated_content")
          .update({
            content: newText,
            metadata: {
              ...((genRecord?.metadata as Record<string, unknown>) || {}),
              last_revision_feedback: textFeedback,
              last_revised_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", generatedContentIdForChanges);

        revised = true;
      } catch (err) {
        console.error("Auto-revision failed after changes_requested:", err);
        failed = true;

        // Fall back to the old behavior: just flag it, a human has to fix it.
        await supabase
          .from("generated_content")
          .update({ status: "changes_requested", rejection_reason: combinedFeedback, updated_at: new Date().toISOString() })
          .eq("id", generatedContentIdForChanges);

        await supabase.from("automation_alerts").insert({
          alert_type: "content_revision_failed",
          title: `Auto-revision failed: ${approval.title}`,
          message: `Client requested changes but the automatic rewrite failed -- needs a manual fix. Feedback: ${combinedFeedback}`,
          severity: "error",
          source: "handle-approval",
          source_id: approval_id,
        });
      }
    }

    // 4. Put the revised version straight back in the client's queue so they
    // can check their changes before the post date, with no admin resend step.
    // Skipped when the rewrite failed (a human still has to fix the text).
    if (!failed) {
      await supabase
        .from("content_approvals")
        .update({
          status: "pending",
          publish_status: "pending",
          feedback: null,
          reviewed_at: null,
          submitted_at: new Date().toISOString(),
          ...(newText ? { full_content: newText, content_preview: newText.substring(0, 300) } : {}),
        })
        .eq("id", approval_id);

      if (generatedContentIdForChanges) {
        if (newText) {
          // Keep the unpublished calendar draft in step with what the client will see.
          await supabase
            .from("content_calendar")
            .update({ content: newText })
            .eq("content_id", generatedContentIdForChanges)
            .eq("status", "draft");
        }
        await supabase
          .from("generated_content")
          .update({ status: "approved", updated_at: new Date().toISOString() })
          .eq("id", generatedContentIdForChanges);
      }
    }

    // Log activity
    await supabase.from("activity_feed").insert({
      client_account_id: clientId,
      activity_type: "content_changes_requested",
      title: `Changes requested: ${approval.title}`,
      description: failed
        ? `${combinedFeedback} — automatic rewrite failed, needs a manual fix.`
        : `${combinedFeedback} — revised version is back with the client for review.`,
      icon: "edit-3",
      metadata: { approval_id, content_type: approval.content_type, revised, image_regenerating: !!imageFeedback },
    });

    return new Response(
      JSON.stringify({ success: true, action: "changes_requested", revised, returned_to_client: !failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("handle-approval error:", error);

    await supabase.from('automation_alerts').insert({
      alert_type: 'function_error',
      severity: 'error',
      title: `Error in handle-approval`,
      message: error instanceof Error ? error.message : 'Unknown error',
      source: 'handle-approval',
      metadata: {
        function_name: 'handle-approval',
        client_id: null,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
