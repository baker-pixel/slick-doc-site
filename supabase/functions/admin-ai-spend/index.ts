import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { checkAdminAuth } from "../_shared/auth.ts";
import { buildSpendReport, type RawUsage } from "../_shared/aiSpend.ts";

// Admin AI Spend & Budget backend.
//   { action: "overview" }                                         -> the whole report
//   { action: "set_budget", amount }                               -> monthly budget in USD (null/0 clears it)
//   { action: "set_rate", key, kind?, label?, provider?,
//     input_per_mtok?, output_per_mtok?, unit_cost?, verified? }   -> edit or add a price
// Admin only (session or password).

const BUDGET_KEY = "ai_monthly_budget_usd";
const MAX_BUDGET = 1_000_000;
const MAX_TOKEN_RATE = 10_000; // USD per 1M tokens: far above any real model, catches typos like 40 for 0.40 only loosely
const MAX_UNIT_COST = 1_000;

const isMoney = (v: unknown, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;

serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const supabase = serviceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await checkAdminAuth(req, supabase, body.password);
    if (!auth.authorized) return errorResponse("Unauthorized", 401);

    switch (body.action) {
      case "overview": {
        const { data, error } = await supabase.rpc("ai_spend_usage");
        if (error) throw error;
        return jsonResponse({ generated_at: new Date().toISOString(), ...buildSpendReport(data as RawUsage, new Date()) });
      }

      case "set_budget": {
        const amount = body.amount === null || body.amount === "" ? 0 : Number(body.amount);
        if (!isMoney(amount, MAX_BUDGET)) return errorResponse("Budget must be a number between 0 and 1,000,000", 400);
        const { data: existing } = await supabase.from("admin_settings").select("id").eq("key", BUDGET_KEY).maybeSingle();
        if (amount === 0) {
          if (existing) await supabase.from("admin_settings").delete().eq("id", existing.id);
        } else if (existing) {
          const { error } = await supabase.from("admin_settings").update({ value: String(amount), updated_at: new Date().toISOString() }).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("admin_settings").insert({ key: BUDGET_KEY, value: String(amount), description: "Monthly AI spend budget in USD (admin AI Spend page)" });
          if (error) throw error;
        }
        return jsonResponse({ ok: true, budget: amount || null });
      }

      case "set_rate": {
        const key = typeof body.key === "string" ? body.key.trim() : "";
        if (!key || key.length > 120) return errorResponse("A model or usage key is required", 400);

        const { data: existing } = await supabase.from("ai_rate_card").select("*").eq("key", key).maybeSingle();
        const kind = existing?.kind ?? (body.kind === "unit" ? "unit" : "tokens");
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

        const field = (name: string, max: number) => {
          if (!(name in body)) return null;
          if (body[name] === null || body[name] === "") { patch[name] = null; return null; }
          const n = Number(body[name]);
          if (!isMoney(n, max)) return `${name.replace(/_/g, " ")} must be a number between 0 and ${max.toLocaleString("en-US")}`;
          patch[name] = n;
          return null;
        };
        const problem = kind === "tokens"
          ? field("input_per_mtok", MAX_TOKEN_RATE) ?? field("output_per_mtok", MAX_TOKEN_RATE)
          : field("unit_cost", MAX_UNIT_COST);
        if (problem) return errorResponse(problem, 400);
        if (typeof body.verified === "boolean") patch.verified = body.verified;
        // Changing a price makes it the owner's number: treat it as verified unless they said otherwise.
        else if (Object.keys(patch).length > 1) patch.verified = true;
        if (typeof body.note === "string") patch.note = body.note.slice(0, 300);

        if (existing) {
          const { error } = await supabase.from("ai_rate_card").update(patch).eq("key", key);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("ai_rate_card").insert({
            key, kind,
            provider: typeof body.provider === "string" && body.provider.trim() ? body.provider.trim().slice(0, 60) : "Other",
            label: typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 100) : key,
            ...patch,
          });
          if (error) throw error;
        }
        return jsonResponse({ ok: true });
      }

      default:
        return errorResponse("Unknown action", 400);
    }
  } catch (err) {
    console.error("admin-ai-spend error:", err);
    return errorResponse(err);
  }
});
