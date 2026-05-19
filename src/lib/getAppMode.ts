export type AppMode = "marketing" | "admin" | "client";

export function getAppMode(): AppMode {
  const hostname = window.location.hostname;

  // Dev: use ?app=admin or ?app=client query param to switch mode
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    const params = new URLSearchParams(window.location.search);
    const override = params.get("app") as AppMode | null;
    if (override === "admin" || override === "client") return override;
    return "marketing";
  }

  if (hostname.startsWith("admin.")) return "admin";
  if (hostname.startsWith("client.")) return "client";
  return "marketing";
}
