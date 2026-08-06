// Shared "write a fix to a client's live WordPress site" logic. Both apply
// paths -- the canonical seo-audit findings flow (apply-fix-to-wordpress) and
// the WP-plugin-scan queue (approve-wp-fix) -- used to each carry their own
// copy of this. One copy now, both callers get the same safety properties:
// plugin-first apply with Basic Auth fallback, an optional pre-apply baseline
// check (skip if the page changed since the fix was generated), and an
// optional post-apply verify (confirm the write actually landed, not just
// that the plugin returned 200).

export interface WpFixRequest {
  fixType: string; // "wp_meta_title" | "wp_meta_description" | "wp_image_alt" | "wp_canonical" | ...
  value: string;
  postUrl?: string | null;
  imageSrc?: string | null;
  /** Already-known WP-native IDs (the plugin-scan queue has these; canonical findings don't). Skips URL/slug resolution when present. */
  postId?: number | null;
  mediaId?: number | null;
}

export interface WpApplyResult {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  postId?: number | null;
}

const TIMEOUT_MS = 10_000;

// Maps old ai_fixes/seo-audit type names -> plugin field names.
const TYPE_TO_FIELD: Record<string, string> = {
  wp_meta_title: "meta_title",
  wp_meta_description: "meta_desc",
  wp_focus_keyword: "focus_keyword",
  wp_image_alt: "alt_text",
  wp_canonical: "canonical",
  wp_slug: "slug",
  wp_title: "title",
};

function basicAuthHeader(user: string, pass: string) {
  return "Basic " + btoa(`${user}:${pass}`);
}

async function resolvePostId(wpBase: string, postUrl: string): Promise<number | null> {
  const slug = postUrl.replace(/\/+$/, "").split("/").pop() ?? "";
  for (const pt of ["pages", "posts"]) {
    const res = await fetch(`${wpBase}/wp-json/wp/v2/${pt}?slug=${encodeURIComponent(slug)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data[0].id;
    }
  }
  return null;
}

async function resolveMediaId(wpBase: string, imageSrc: string): Promise<number | null> {
  const fname = imageSrc.split("/").pop() ?? "";
  const res = await fetch(`${wpBase}/wp-json/wp/v2/media?search=${encodeURIComponent(fname)}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.ok) {
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) return data[0].id;
  }
  return null;
}

/** Preferred path: the OrangeDoor plugin's own /apply endpoint. */
export async function applyViaPlugin(
  wpBase: string,
  token: string,
  req: WpFixRequest,
): Promise<WpApplyResult> {
  const field = TYPE_TO_FIELD[req.fixType] ?? req.fixType.replace("wp_", "");
  const value = req.value;

  let postId = req.postId ?? null;
  let mediaId = req.mediaId ?? null;

  if (!postId && !mediaId) {
    if (field === "alt_text" && req.imageSrc) {
      mediaId = await resolveMediaId(wpBase, req.imageSrc);
    } else if (req.postUrl) {
      postId = await resolvePostId(wpBase, req.postUrl);
    }
  }

  if (!postId && !mediaId) {
    throw new Error(`Could not resolve post/media ID from URL: ${req.postUrl || req.imageSrc}`);
  }

  const fixPayload: Record<string, unknown> = { field, value };
  if (mediaId) fixPayload.media_id = mediaId;
  else if (postId) fixPayload.post_id = postId;

  const res = await fetch(`${wpBase}/wp-json/orangedoor/v1/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-OD-Token": token },
    body: JSON.stringify({ fixes: [fixPayload] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Plugin /apply returned ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  const failed = data?.failed ?? [];
  if (failed.length > 0) {
    throw new Error(`Plugin reported failure: ${failed[0]?.error ?? "unknown"}`);
  }

  return { before: {}, after: { value }, postId };
}

/** Fallback for clients without the plugin installed. */
export async function applyViaBasicAuth(
  wpBase: string,
  username: string,
  appPassword: string,
  req: WpFixRequest,
): Promise<WpApplyResult> {
  const auth = basicAuthHeader(username, appPassword);
  const postUrl = req.postUrl ?? wpBase;

  if (req.fixType === "wp_image_alt") {
    const imgSrc = req.imageSrc ?? "";
    const mediaRes = await fetch(
      `${wpBase}/wp-json/wp/v2/media?search=${encodeURIComponent(imgSrc.split("/").pop() ?? "")}`,
      { headers: { Authorization: auth } },
    );
    if (!mediaRes.ok) throw new Error("Could not look up image in WordPress media library");
    const media = await mediaRes.json();
    if (!Array.isArray(media) || media.length === 0) throw new Error("Image not found in WordPress media library");
    const mediaId = media[0].id;
    const updateRes = await fetch(`${wpBase}/wp-json/wp/v2/media/${mediaId}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ alt_text: req.value }),
    });
    if (!updateRes.ok) throw new Error(`WordPress update failed: ${updateRes.status} ${await updateRes.text()}`);
    return { before: { alt_text: media[0].alt_text }, after: { alt_text: req.value }, postId: null };
  }

  const slug = postUrl.replace(/\/+$/, "").split("/").pop() || "";
  let post: { id: number; type: string; current: Record<string, unknown> } | null = null;
  for (const pt of ["pages", "posts"]) {
    const res = await fetch(`${wpBase}/wp-json/wp/v2/${pt}?slug=${encodeURIComponent(slug)}`, {
      headers: { Authorization: auth },
    });
    if (res.ok) {
      const arr = await res.json();
      if (Array.isArray(arr) && arr.length > 0) { post = { id: arr[0].id, type: pt, current: arr[0] }; break; }
    }
  }
  if (!post) throw new Error("Could not locate the WordPress page/post to update");

  let updateBody: Record<string, unknown> = {};
  let beforeSnap: Record<string, unknown> = {};
  let afterSnap: Record<string, unknown> = {};

  if (req.fixType === "wp_meta_title") {
    const current = post.current as { title?: { rendered?: string } };
    beforeSnap = { title: current.title?.rendered };
    updateBody = { title: req.value };
    afterSnap = { title: req.value };
  } else if (req.fixType === "wp_meta_description") {
    const current = post.current as { yoast_head_json?: { description?: string }; excerpt?: { rendered?: string } };
    beforeSnap = { meta_description: current.yoast_head_json?.description || current.excerpt?.rendered };
    updateBody = { excerpt: req.value, meta: { _yoast_wpseo_metadesc: req.value, rank_math_description: req.value } };
    afterSnap = { meta_description: req.value };
  } else {
    updateBody = { meta: { [`_od_${req.fixType.replace("wp_", "")}`]: req.value } };
    afterSnap = { value: req.value };
  }

  const updateRes = await fetch(`${wpBase}/wp-json/wp/v2/${post.type}/${post.id}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(updateBody),
  });
  if (!updateRes.ok) throw new Error(`WordPress update failed: ${updateRes.status} ${await updateRes.text()}`);

  return { before: beforeSnap, after: afterSnap, postId: post.id };
}

/**
 * Confirms a plugin-applied fix actually landed, by reading the field back
 * and comparing it to what we tried to write.
 *
 * Deliberately does NOT trust the plugin's own `saved` flag: confirmed live
 * against a real install that it returns `saved: true` unconditionally,
 * regardless of what's actually in the database (a real bug in the plugin
 * source, fixed there too -- but every already-installed copy needs a
 * manual update to pick that up, which doesn't help today). The endpoint's
 * returned field values themselves ARE the real current DB state, so
 * comparing those ourselves is reliable independent of that bug.
 */
export async function verifyWpFix(
  wpBase: string,
  token: string,
  postId: number,
  fixType: string,
  expectedValue: string,
): Promise<boolean> {
  const field = TYPE_TO_FIELD[fixType] ?? fixType.replace("wp_", "");
  try {
    const res = await fetch(`${wpBase}/wp-json/orangedoor/v1/verify/${postId}`, {
      headers: { "X-OD-Token": token },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const actual = data?.[field];
    if (typeof actual !== "string") return false; // e.g. alt_text -- /verify has no equivalent, can't confirm
    return actual.trim() === expectedValue.trim();
  } catch {
    return false;
  }
}

/** Pre-apply baseline check via a plain HTML fetch -- catches "the page changed since this fix was generated." Only covers the two fields crawl-based detection can read; returns null (can't check) for everything else. */
export async function currentWpFieldValue(fixType: string, postUrl: string): Promise<string | null> {
  if (!postUrl) return null;
  try {
    const res = await fetch(postUrl, { headers: { "User-Agent": "OrangeDoorSEOBot/1.0" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const html = await res.text();
    if (fixType === "wp_meta_title") return (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? "").trim();
    if (fixType === "wp_meta_description") return (html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? "").trim();
    return null;
  } catch {
    return null;
  }
}

/** One entry point: tries the plugin token first, falls back to Basic Auth. */
export async function applyWpFix(
  wpBase: string,
  creds: { pluginToken?: string | null; basicAuthUser?: string | null; basicAuthPass?: string | null },
  req: WpFixRequest,
): Promise<WpApplyResult> {
  if (creds.pluginToken) return applyViaPlugin(wpBase, creds.pluginToken, req);
  if (creds.basicAuthUser && creds.basicAuthPass) return applyViaBasicAuth(wpBase, creds.basicAuthUser, creds.basicAuthPass, req);
  throw new Error("No WordPress credentials. Install the OrangeDoor plugin or add Basic Auth.");
}
