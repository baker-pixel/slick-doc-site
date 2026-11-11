import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Mirrors the response of supabase/functions/get-live-analytics.
export type LiveTraffic =
  | { state: "no_site" }
  | { state: "needs_update"; plugin_version: string | null; latest_version: string }
  | { state: "off" }
  | { state: "waiting" }
  | {
      state: "active";
      active_now: number;
      viewing: { path: string; visitors: number }[];
      daily: { day: string; visits: number; pageviews: number }[];
      visits_today: number;
      visits_7d: number;
      pageviews_7d: number;
      last_event_at: string | null;
    };

export interface LiveAnalytics {
  generated_at: string;
  traffic: LiveTraffic | null; // null: couldn't be loaded right now
  engagement: { leads_generated: number; email_opens: number; email_clicks: number };
}

// Polls get-live-analytics. The snapshot table behind the rest of the Analytics
// tab only updates weekly; this is the "right now" layer on top of it. Polling
// pauses while the tab is hidden and refreshes immediately when the user comes
// back. Every state keeps polling, since the call is cheap and that is also how
// the card flips from "update your plugin" to live numbers shortly after a
// client installs it.
export function useLiveAnalytics(clientAccountId: string, intervalMs = 60_000) {
  const [data, setData] = useState<LiveAnalytics | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requestCounter = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestCounter.current;
    setRefreshing(true);
    try {
      const { data: res, error: invokeErr } = await supabase.functions.invoke("get-live-analytics", {
        body: { client_account_id: clientAccountId },
      });
      if (id !== requestCounter.current) return; // a newer request (or unmount) superseded this one
      if (invokeErr || res?.error) throw new Error(res?.error || invokeErr?.message || "Failed");
      setData(res as LiveAnalytics);
      setError(false);
    } catch (e) {
      if (id !== requestCounter.current) return;
      console.error("Error fetching live analytics:", e);
      setError(true); // keep showing the last good data, if any
    } finally {
      if (id === requestCounter.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [clientAccountId]);

  useEffect(() => {
    setData(null);
    setLoading(true);
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      load();
      timer = setInterval(load, intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    const counter = requestCounter;
    return () => {
      stop();
      counter.current++; // drop any in-flight response
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load, intervalMs]);

  return { data, error, loading, refreshing, refresh: load };
}
