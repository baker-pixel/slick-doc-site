// The autonomy gate: given how much freedom a steward has been granted for this
// client and engine, what happens to an action it chooses? This is code, not
// prompt, so no wording from the model or from client data can widen it.
export type Autonomy = "shadow" | "propose" | "auto_internal" | "auto_publish";
export type SideEffect = "internal" | "external";
/** record_only: written down for review, never actionable. queue: waits for a person. execute: runs now. */
export type Disposition = "record_only" | "queue" | "execute";

export function dispositionFor(autonomy: Autonomy, sideEffect: SideEffect, executable: boolean): Disposition {
  if (autonomy === "shadow") return "record_only";
  // Advisory actions have nothing to run: a person always carries them out.
  if (!executable) return "queue";
  if (autonomy === "propose") return "queue";
  if (autonomy === "auto_internal") return sideEffect === "internal" ? "execute" : "queue";
  return "execute"; // auto_publish
}
