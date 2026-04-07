import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";

interface AdminAuthContextType {
  adminPassword: string;
  isAuthenticated: boolean;
  login: (password: string) => void;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null);

const SESSION_KEY = "admin_session_password";
const LAST_ACTIVITY_KEY = "admin_last_activity";
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [adminPassword, setAdminPassword] = useState(() => sessionStorage.getItem(SESSION_KEY) || "");
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!sessionStorage.getItem(SESSION_KEY));
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(() => {
    setAdminPassword("");
    setIsAuthenticated(false);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(LAST_ACTIVITY_KEY);
    // Also clean up legacy localStorage
    localStorage.removeItem("admin_password");
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
    sessionStorage.setItem(SESSION_KEY, password);
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
