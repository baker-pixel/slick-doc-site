import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { briefForConcept, briefForPrompt, colourPalette, extractPhotoUrls } from "./visualBrief.ts";

Deno.test("extractPhotoUrls keeps content photos, skips logos, icons, svg and tiny images", () => {
  const html = `
    <meta property="og:image" content="/og.jpg">
    <img src="/team.jpg" width="800" height="600">
    <img src="/logo.png" class="site-logo">
    <img src="/icon.svg">
    <img src="/tiny.jpg" width="40" height="40">
    <img src="http://localhost/x.jpg">
    <img srcset="/a-400.jpg 400w, /a-1200.jpg 1200w" src="/a.jpg">`;
  assertEquals(extractPhotoUrls(html, "https://example.com"), [
    "https://example.com/og.jpg",
    "https://example.com/team.jpg",
    "https://example.com/a-1200.jpg",
  ]);
});

Deno.test("colourPalette drops black/white so the grade never reads as an instruction to shoot b&w", () => {
  assertEquals(colourPalette({ palette: ["soft beige", "black and white", "muted grey", "Monochrome"] }), ["soft beige", "muted grey"]);
  assertEquals(briefForPrompt({ palette: ["black and white"] }), "");
});

Deno.test("a brief built from slides and text graphics adds nothing photographic", () => {
  const slides = {
    palette: ["dark blue", "orange"],
    photo_style: "clean framing with clear focus on graphic elements and text, minimal realism",
    settings: ["business presentation slides"],
    objects: ["text overlays"],
  };
  assertEquals(briefForConcept(slides).includes("slides"), false);
  assertEquals(briefForPrompt(slides).includes("graphic"), false);
  assertEquals(briefForPrompt(slides).includes("minimal realism"), false);
});
