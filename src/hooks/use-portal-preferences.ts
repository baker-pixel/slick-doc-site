import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PortalPreferences } from "@/components/client-portal/ClientSettingsTab";

const defaultPreferences: PortalPreferences = {
  theme: "system",
  accent_color: "default",
  layout_density: "comfortable",
  default_landing_page: "activity",
  hidden_tabs: [],
  pinned_sections: [],
  email_notifications: true,
  notification_digest: "instant",
  notify_on_messages: true,
  notify_on_approvals: true,
  notify_on_deliverables: true,
  notify_on_invoices: true,
  notify_on_meetings: true,
  activity_widget_types: ["messages", "approvals", "projects", "deliverables"],
  show_analytics_summary: true,
  show_quick_actions: true,
};

const accentColorValues: Record<string, { h: number; s: number; l: number }> = {
  default: { h: 24, s: 95, l: 53 }, // Orange (original primary)
  blue: { h: 217, s: 91, l: 60 },
  green: { h: 142, s: 71, l: 45 },
  purple: { h: 262, s: 83, l: 58 },
  orange: { h: 24, s: 95, l: 53 },
  rose: { h: 346, s: 77, l: 50 },
};

export function usePortalPreferences(userId: string | undefined) {
  const [preferences, setPreferences] = useState<PortalPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);

  // Apply theme to document
  const applyTheme = useCallback((theme: PortalPreferences["theme"]) => {
    const root = document.documentElement;
    
    if (theme === "system") {
      const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", systemPrefersDark);
    } else {
      root.classList.toggle("dark", theme === "dark");
    }
  }, []);

  // Apply accent color as CSS custom properties
  const applyAccentColor = useCallback((colorId: string) => {
    const root = document.documentElement;
    const color = accentColorValues[colorId] || accentColorValues.default;
    
    // Update primary color
    root.style.setProperty("--primary", `${color.h} ${color.s}% ${color.l}%`);
    root.style.setProperty("--ring", `${color.h} ${color.s}% ${color.l}%`);
    root.style.setProperty("--sidebar-ring", `${color.h} ${color.s}% ${color.l}%`);
    
    // Update sidebar primary in dark mode
    if (document.documentElement.classList.contains("dark")) {
      root.style.setProperty("--sidebar-primary", `${color.h} ${color.s}% ${color.l}%`);
      root.style.setProperty("--accent", `${color.h} ${color.s}% ${color.l}%`);
    }
  }, []);

  // Apply layout density
  const applyDensity = useCallback((density: PortalPreferences["layout_density"]) => {
    const root = document.documentElement;
    
    // Remove existing density classes
    root.classList.remove("density-compact", "density-comfortable", "density-spacious");
    
    // Add the new density class
    root.classList.add(`density-${density}`);
  }, []);

  // Apply all preferences
  const applyPreferences = useCallback((prefs: PortalPreferences) => {
    applyTheme(prefs.theme);
    applyAccentColor(prefs.accent_color);
    applyDensity(prefs.layout_density);
  }, [applyTheme, applyAccentColor, applyDensity]);

  // Fetch preferences from database
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchPreferences = async () => {
      try {
        const { data, error } = await supabase
          .from("client_portal_preferences")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

        if (error && error.code !== "PGRST116") {
          throw error;
        }

        if (data) {
          const prefs: PortalPreferences = {
            theme: data.theme as PortalPreferences["theme"],
            accent_color: data.accent_color,
            layout_density: data.layout_density as PortalPreferences["layout_density"],
            default_landing_page: data.default_landing_page as any,
            hidden_tabs: data.hidden_tabs || [],
            pinned_sections: data.pinned_sections || [],
            email_notifications: data.email_notifications,
            notification_digest: data.notification_digest as PortalPreferences["notification_digest"],
            notify_on_messages: data.notify_on_messages,
            notify_on_approvals: data.notify_on_approvals,
            notify_on_deliverables: data.notify_on_deliverables,
            notify_on_invoices: data.notify_on_invoices,
            notify_on_meetings: data.notify_on_meetings,
            activity_widget_types: data.activity_widget_types || [],
            show_analytics_summary: data.show_analytics_summary,
            show_quick_actions: data.show_quick_actions,
          };
          setPreferences(prefs);
          applyPreferences(prefs);
        } else {
          applyPreferences(defaultPreferences);
        }
      } catch (error) {
        console.error("Error fetching preferences:", error);
        applyPreferences(defaultPreferences);
      } finally {
        setLoading(false);
      }
    };

    fetchPreferences();
  }, [userId, applyPreferences]);

  // Listen for system theme changes
  useEffect(() => {
    if (preferences.theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => applyTheme("system");
    
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [preferences.theme, applyTheme]);

  // Update preferences handler
  const updatePreferences = useCallback((newPrefs: PortalPreferences) => {
    setPreferences(newPrefs);
    applyPreferences(newPrefs);
  }, [applyPreferences]);

  return {
    preferences,
    loading,
    updatePreferences,
    applyPreferences,
  };
}
