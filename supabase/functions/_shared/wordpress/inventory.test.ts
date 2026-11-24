import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { assembleInventory, missingParts, validUploadId } from "./inventory.ts";

Deno.test("parts are put back in order and split by kind", () => {
  const inv = assembleInventory("https://a.com", [
    { part: 2, kind: "media", payload: { items: [{ id: 9 }] } },
    { part: 0, kind: "posts", payload: { items: [{ id: 1 }, { id: 2 }] } },
    { part: 1, kind: "pages", payload: { items: [{ id: 3 }] } },
    { part: 3, kind: "meta", payload: { sitemap: { sitemap_url: "https://a.com/s.xml" } } },
  ]);
  assertEquals(inv.posts.map((p) => p.id), [1, 2]);
  assertEquals(inv.pages.map((p) => p.id), [3]);
  assertEquals(inv.media.map((p) => p.id), [9]);
  assertEquals(inv.sitemap.sitemap_url, "https://a.com/s.xml");
});

Deno.test("an item that shifted between parts is kept once; the assembled marker is ignored", () => {
  const inv = assembleInventory("https://a.com", [
    { part: 0, kind: "posts", payload: { items: [{ id: 1 }, { id: 2 }] } },
    { part: 1, kind: "posts", payload: { items: [{ id: 2 }, { id: 3 }] } },
    { part: -1, kind: "marker", payload: {} },
  ]);
  assertEquals(inv.posts.map((p) => p.id), [1, 2, 3]);
});

Deno.test("junk kinds and payloads are ignored, not fatal", () => {
  const inv = assembleInventory("https://a.com", [
    { part: 0, kind: "evil", payload: { items: [{ id: 1 }] } },
    { part: 1, kind: "posts", payload: null },
  ]);
  assertEquals(inv.posts.length + inv.pages.length + inv.media.length, 0);
});

Deno.test("completeness check and id validation", () => {
  assertEquals(missingParts([0, 1, 3], 4), [2]);
  assertEquals(missingParts([0, 1, 2], 3), []);
  assertEquals(validUploadId("abcdef0123456789"), true);
  assertEquals(validUploadId("short"), false);
  assertEquals(validUploadId("ABCDEF0123456789"), false);
});
