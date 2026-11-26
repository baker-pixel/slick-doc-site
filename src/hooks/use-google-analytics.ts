import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type GaTotals = { sessions: number; users: number; pageviews: number; engagement_rate: number };
export type GaProperty = { id: string; name: string; account: string };
export type GaReport =
  | { state: "not_connected" | "needs_reconnect" | "no_property" }
  | {
      state: "active";
      days: number;
      property: { id: string; name: string };
      email: string | null;
      current: GaTotals;
      previous: GaTotals;
      daily: { day: string; sessions: number; users: number }[];
      top_pages: { path: string; views: number }[];
      channels: { channel: string; sessions: number }[];
    };
type Status = { connected: boolean; needs_reconnect: boolean; email: string | null };

const RETURN_MESSAGES: Record<string, { title: string; description: string; destructive?: boolean }> = {
  connected: { title: "Google Analytics connected", description: "Now choose which website to report on." },
  denied: { title: "Connection cancelled", description: "No access was granted to your Google account.", destructive: true },
  scope: { title: "Analytics permission needed", description: "Please tick the Google Analytics permission when connecting, so we can show your website traffic.", destructive: true },
  error: { title: "Couldn't connect Google Analytics", description: "Something went wrong. Please try again.", destructive: true },
};

/**
 * The client's Google Analytics connection + report for the selected range. One instance per
 * Analytics tab, shared by the KPI row, insights and the Website tab (all talk to the
 * google-analytics-connect edge function; tokens never reach the browser).
 */
export function useGoogleAnalytics(clientAccountId: string, days: number) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [report, setReport] = useState<GaReport | null>(null);
  const [properties, setProperties] = useState<GaProperty[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const call = useCallback(async <T,>(action: string, extra: Record<string, unknown> = {}): Promise<T> => {
    const { data, error: err } = await supabase.functions.invoke("google-analytics-connect", {
      body: { action, client_account_id: clientAccountId, ...extra },
    });
    if (err || data?.error) throw new Error(data?.error || err?.message || "Request failed");
    return data as T;
  }, [clientAccountId]);

  const load = useCallback(async () => {
    setError(false);
    try {
      const s = await call<Status>("status");
      setStatus(s);
      if (!s.connected || s.needs_reconnect) { setReport(null); return; }
      const r = await call<GaReport>("report", { days });
      setReport(r);
      if (r.state === "needs_reconnect") setStatus({ ...s, needs_reconnect: true });
      if (r.state === "no_property") setProperties(await call<{ properties: GaProperty[] }>("properties").then((x) => x.properties));
    } catch (e) {
      console.error("Google Analytics load failed:", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [call, days]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Returning from Google's consent screen: ?google=connected|denied|scope|error
  useEffect(() => {
    const result = searchParams.get("google");
    if (!result) return;
    const msg = RETURN_MESSAGES[result];
    if (msg) toast({ title: msg.title, description: msg.description, variant: msg.destructive ? "destructive" : undefined });
    const next = new URLSearchParams(searchParams);
    next.delete("google");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const fail = (title: string, e: unknown) =>
    toast({ title, description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });

  const connect = async () => {
    setBusy(true);
    try {
      const { url } = await call<{ url: string }>("start", { return_origin: window.location.origin });
      window.location.href = url;
    } catch (e) { fail("Couldn't start Google sign-in", e); setBusy(false); }
  };

  const choose = async (p: GaProperty) => {
    setBusy(true);
    try {
      await call("select_property", { property_id: p.id });
      setProperties(null);
      setLoading(true);
      await load();
    } catch (e) { fail("Couldn't select property", e); } finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await call("disconnect");
      setReport(null); setProperties(null); setStatus({ connected: false, needs_reconnect: false, email: null });
      toast({ title: "Google Analytics disconnected" });
    } catch (e) { fail("Couldn't disconnect", e); } finally { setBusy(false); }
  };

  const active = report?.state === "active" ? report : null;
  return { status, report, active, properties, loading, busy, error, connect, choose, disconnect, refresh: load };
}
