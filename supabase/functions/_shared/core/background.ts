// Keeps a fire-and-forget promise alive after the HTTP response has been sent.
// A bare un-awaited fetch() can be dropped when the edge isolate is recycled
// right after responding; EdgeRuntime.waitUntil holds the isolate open until
// the promise settles. Falls back to a plain detached promise outside the
// Supabase runtime (local deno, tests).
export function runInBackground(task: Promise<unknown>): void {
  const guarded = task.catch((e) => console.error("[background] task failed:", e instanceof Error ? e.message : e));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") rt.waitUntil(guarded);
}
