import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { agentFieldForFixType, queueProblem } from "./agentQueue.ts";

Deno.test("only safe fix types map to agent fields", () => {
  assertEquals(agentFieldForFixType("wp_meta_title"), "meta_title");
  assertEquals(agentFieldForFixType("wp_image_alt"), "alt_text");
  assertEquals(agentFieldForFixType("wp_slug"), null);   // would change the page URL
  assertEquals(agentFieldForFixType("wp_title"), null);  // would change the visible heading
  assertEquals(agentFieldForFixType("wp_nonsense"), null);
});

Deno.test("a change needs a value and a target", () => {
  assertEquals(queueProblem({ field: "meta_title", value: "  " }), "There is no value to apply.");
  assertEquals(queueProblem({ field: "meta_title", value: "x" }), "Which page this is for is missing.");
  assertEquals(queueProblem({ field: "meta_title", value: "x", pageUrl: "https://a.com/x" }), null);
  assertEquals(queueProblem({ field: "alt_text", value: "x", pageUrl: "https://a.com/x" }), "Which image this is for is missing.");
  assertEquals(queueProblem({ field: "alt_text", value: "x", imageSrc: "https://a.com/i.jpg" }), null);
  assertEquals(queueProblem({ field: "schema_jsonld", value: "{}" }), null);
});
