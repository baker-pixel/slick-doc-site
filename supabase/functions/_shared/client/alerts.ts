import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AlertOptions {
  source: string;
  title: string;
  message: string;
  alertType?: string;
  severity?: "info" | "warning" | "error" | "high" | "critical";
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Best-effort admin alert. Never throws — alerting must not mask the
 * original failure.
 */
export async function logAlert(supabase: SupabaseClient, opts: AlertOptions): Promise<void> {
  try {
    await supabase.from("automation_alerts").insert({
      alert_type: opts.alertType ?? "function_error",
      severity: opts.severity ?? "error",
      title: opts.title,
      message: opts.message,
      source: opts.source,
      ...(opts.sourceId ? { source_id: opts.sourceId } : {}),
      metadata: {
        timestamp: new Date().toISOString(),
        ...(opts.metadata ?? {}),
      },
    });
  } catch (e) {
    console.error(`[alerts] failed to write automation_alert from ${opts.source}:`, e);
  }
}

/** Convenience wrapper for the standard catch-block alert. */
export function functionErrorAlert(
  supabase: SupabaseClient,
  functionName: string,
  err: unknown,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const message = err instanceof Error ? err.message : "Unknown error";
  return logAlert(supabase, {
    source: functionName,
    title: `Error in ${functionName}`,
    message,
    metadata: { function_name: functionName, error_message: message, ...metadata },
  });
}
