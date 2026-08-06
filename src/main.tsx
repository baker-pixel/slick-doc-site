import React from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { getAppMode } from "./lib/getAppMode.ts";
import "./index.css";

const mode = getAppMode();

// Social-connect popups (Post for Me, and the legacy per-platform OAuth
// callbacks) redirect back to a URL configured outside this codebase (PfM's
// own dashboard) -- wherever that lands, if it's a window we opened
// ourselves it should just close, not boot the full app a second time. The
// opener (ClientIntegrationsTab's focus handler) is what actually detects
// success/failure by re-querying the DB, not anything read from this URL.
function isOAuthPopupReturn(): boolean {
  if (!window.opener) return false;
  const p = new URLSearchParams(window.location.search);
  return (p.has("isSuccess") && p.has("provider")) || (p.has("connected") && p.has("success"));
}

if (isOAuthPopupReturn()) {
  document.getElementById("root")!.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font:15px -apple-system,sans-serif;color:#666">Connected — you can close this window.</div>';
  window.close();
}

async function bootstrap() {
  if (isOAuthPopupReturn()) return;

  let App: React.ComponentType;

  if (mode === "admin") {
    const { AdminApp } = await import("./apps/AdminApp.tsx");
    App = AdminApp;
  } else if (mode === "client") {
    const { ClientApp } = await import("./apps/ClientApp.tsx");
    App = ClientApp;
  } else {
    const { MarketingApp } = await import("./apps/MarketingApp.tsx");
    App = MarketingApp;
  }

  // App shell loaded successfully — re-arm the stale-chunk reload guard
  sessionStorage.removeItem("chunk_reload_attempted");

  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

bootstrap();
