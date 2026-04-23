import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";

interface AdminAuthContextType {
  adminPassword: string;
  isAuthenticated: boolean;
  login: (password: string) => void;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null);

const SESSION_FLAG_KEY = "admin_authenticated";
const LAST_ACTIVITY_KEY = "admin_last_activity";
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  // Password lives ONLY in memory — never persisted to storage.
  const [adminPassword, setAdminPassword] = useState("");
  // Restore auth flag from sessionStorage, but only if within timeout window.
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const flag = sessionStorage.getItem(SESSION_FLAG_KEY) === "true";
    if (!flag) return false;
    const lastActivity = parseInt(sessionStorage.getItem(LAST_ACTIVITY_KEY) || "0", 10);
    if (!lastActivity || Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS) {
      sessionStorage.removeItem(SESSION_FLAG_KEY);
      sessionStorage.removeItem(LAST_ACTIVITY_KEY);
      return false;
    }
    // Flag is valid but password is gone (page refresh) — force re-auth.
    sessionStorage.removeItem(SESSION_FLAG_KEY);
    sessionStorage.removeItem(LAST_ACTIVITY_KEY);
    return false;
  });
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(() => {
    setAdminPassword("");
    setIsAuthenticated(false);
    sessionStorage.removeItem(SESSION_FLAG_KEY);
    sessionStorage.removeItem(LAST_ACTIVITY_KEY);
    // Also clean up legacy localStorage
    localStorage.removeItem("admin_password");
    // Clean up legacy sessionStorage key
    sessionStorage.removeItem("admin_session_password");
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (!isAuthenticated) return;
    sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    logoutTimerRef.current = setTimeout(logout, INACTIVITY_TIMEOUT_MS);
  }, [isAuthenticated, logout]);

  const login = useCallback((password: string) => {
    setAdminPassword(password);
    setIsAuthenticated(true);
    sessionStorage.setItem(SESSION_FLAG_KEY, "true");
    sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
  }, []);

  // On mount, check if session has expired
  useEffect(() => {
    if (!isAuthenticated) return;
    const lastActivity = parseInt(sessionStorage.getItem(LAST_ACTIVITY_KEY) || "0", 10);
    if (lastActivity && Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS) {
      logout();
      return;
    }
    resetInactivityTimer();
  }, [isAuthenticated, logout, resetInactivityTimer]);

  // Track user activity to reset timer
  useEffect(() => {
    if (!isAuthenticated) return;
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    const handler = () => resetInactivityTimer();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };
  }, [isAuthenticated, resetInactivityTimer]);

  return (
    <AdminAuthContext.Provider value={{ adminPassword, isAuthenticated, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return context;
}
