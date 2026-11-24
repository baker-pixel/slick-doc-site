// Queueing changes for v2 (agent) sites. Both apply paths (portal approve and the
// admin/audit apply) end up here instead of calling the site.

// Fix type (SEO audit / ai_fixes naming) -> the plugin's field name. Deliberately
// has no slug or visible-title entries: the agent never edits those.
const FIELD_FOR_FIXTYPE: Record<string, string> = {
  wp_meta_title: "meta_title",
  wp_meta_description: "meta_desc",
  wp_focus_keyword: "focus_keyword",
  wp_image_alt: "alt_text",
  wp_canonical: "canonical",
  wp_schema_jsonld: "schema_jsonld",
  wp_faq_jsonld: "faq_jsonld",
  wp_llms_txt: "llms_txt",
};

const SITE_LEVEL = new Set(["schema_jsonld", "llms_txt"]);

/** The agent's field for a fix type, or null when the agent will not make that change. */
export function agentFieldForFixType(fixType: string): string | null {
  return FIELD_FOR_FIXTYPE[fixType] ?? null;
}

export interface QueueInput {
  siteId: string;
  field: string;
  value: string;
  postId?: number | null;
  mediaId?: number | null;
  pageUrl?: string | null;
  imageSrc?: string | null;
  fixId?: string | null;     // wp_fix_queue row
  aiFixId?: string | null;   // ai_fixes row
  requestedBy: "client" | "admin" | "auto";
}

/** Why this change cannot be queued, or null when it can. */
export function queueProblem(i: Pick<QueueInput, "field" | "value" | "postId" | "mediaId" | "pageUrl" | "imageSrc">): string | null {
  if (!i.value || !i.value.trim()) return "There is no value to apply.";
  if (SITE_LEVEL.has(i.field)) return null;
  if (i.field === "alt_text") {
    return i.mediaId || i.imageSrc ? null : "Which image this is for is missing.";
  }
  return i.postId || i.pageUrl ? null : "Which page this is for is missing.";
}

// deno-lint-ignore no-explicit-any
export async function findAgentSite(supabase: any, clientId: string): Promise<{ id: string; status: string; last_heartbeat_at: string | null } | null> {
  const { data } = await supabase
    .from("connected_sites")
    .select("id, status, last_heartbeat_at")
    .eq("client_id", clientId).eq("agent_mode", "agent").maybeSingle();
  return data ?? null;
}

// deno-lint-ignore no-explicit-any
export async function queueAgentChange(supabase: any, i: QueueInput): Promise<string> {
  const problem = queueProblem(i);
  if (problem) throw new Error(problem);

  // Asking twice for the same fix must not queue it twice.
  const dupe = i.fixId
    ? await supabase.from("site_changes").select("id").eq("fix_id", i.fixId).in("status", ["queued", "delivered", "applied", "unverified"]).maybeSingle()
    : i.aiFixId
      ? await supabase.from("site_changes").select("id").eq("ai_fix_id", i.aiFixId).in("status", ["queued", "delivered", "applied", "unverified"]).maybeSingle()
      : { data: null };
  if (dupe.data) return dupe.data.id;

  const { data, error } = await supabase.from("site_changes").insert({
    site_id: i.siteId,
    fix_id: i.fixId ?? null,
    ai_fix_id: i.aiFixId ?? null,
    post_id: i.postId ?? null,
    media_id: i.mediaId ?? null,
    page_url: i.pageUrl ?? null,
    image_src: i.imageSrc ?? null,
    field: i.field,
    new_value: i.value,
    requested_by: i.requestedBy,
  }).select("id").single();
  if (error || !data) throw new Error("Could not queue the change: " + (error?.message ?? "unknown"));
  return data.id;
}
