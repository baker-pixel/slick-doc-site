import React from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { getAppMode } from "./lib/getAppMode.ts";
import "./index.css";

const mode = getAppMode();

async function bootstrap() {
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

  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

bootstrap();
