// Puts the parts of a site inventory (uploaded by the plugin one request at a
// time) back together into the shape the scan analysis already expects.

export interface InventoryChunk {
  part: number;
  kind: string;
  // deno-lint-ignore no-explicit-any
  payload: any;
}

export interface AssembledInventory {
  site_url: string;
  scanned_at: string;
  // deno-lint-ignore no-explicit-any
  posts: any[];
  // deno-lint-ignore no-explicit-any
  pages: any[];
  // deno-lint-ignore no-explicit-any
  media: any[];
  // deno-lint-ignore no-explicit-any
  sitemap: any;
}

export const MAX_PARTS = 500;
export const MAX_ITEMS_PER_PART = 500;
export const CHUNK_KINDS = ["posts", "pages", "media", "meta"] as const;

export function validUploadId(id: unknown): id is string {
  return typeof id === "string" && /^[a-f0-9]{16}$/.test(id);
}

/** Parts must be 0..total-1 with no gaps; returns what is missing (empty = complete). */
export function missingParts(parts: number[], total: number): number[] {
  const have = new Set(parts);
  const out: number[] = [];
  for (let i = 0; i < total; i++) if (!have.has(i)) out.push(i);
  return out;
}

export function assembleInventory(siteUrl: string, chunks: InventoryChunk[]): AssembledInventory {
  const sorted = [...chunks].filter((c) => c.part >= 0).sort((a, b) => a.part - b.part);
  const out: AssembledInventory = { site_url: siteUrl, scanned_at: new Date().toISOString(), posts: [], pages: [], media: [], sitemap: {} };
  const seen = { posts: new Set<number>(), pages: new Set<number>(), media: new Set<number>() };
  for (const c of sorted) {
    if (c.kind === "meta") {
      out.sitemap = c.payload?.sitemap ?? {};
      continue;
    }
    if (c.kind !== "posts" && c.kind !== "pages" && c.kind !== "media") continue;
    const items = Array.isArray(c.payload?.items) ? c.payload.items : [];
    for (const it of items) {
      // A page edited while the upload was running can appear in two parts; keep the first.
      if (typeof it?.id === "number") {
        if (seen[c.kind].has(it.id)) continue;
        seen[c.kind].add(it.id);
      }
      out[c.kind].push(it);
    }
  }
  return out;
}
