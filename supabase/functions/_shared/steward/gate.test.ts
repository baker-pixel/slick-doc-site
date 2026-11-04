import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { dispositionFor } from "./gate.ts";

Deno.test("shadow records and never acts, whatever the action", () => {
  for (const se of ["internal", "external"] as const) for (const ex of [true, false]) assertEquals(dispositionFor("shadow", se, ex), "record_only");
});

Deno.test("propose always queues for a person", () => {
  for (const se of ["internal", "external"] as const) for (const ex of [true, false]) assertEquals(dispositionFor("propose", se, ex), "queue");
});

Deno.test("auto_internal runs internal executable actions, queues external and advisory ones", () => {
  assertEquals(dispositionFor("auto_internal", "internal", true), "execute");
  assertEquals(dispositionFor("auto_internal", "external", true), "queue");
  assertEquals(dispositionFor("auto_internal", "internal", false), "queue");
});

Deno.test("auto_publish runs executable actions but still queues advisory ones", () => {
  assertEquals(dispositionFor("auto_publish", "external", true), "execute");
  assertEquals(dispositionFor("auto_publish", "external", false), "queue");
});
