import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Palette,
  Layout,
  Bell,
  LayoutGrid,
  Save,
  Sun,
  Moon,
  Monitor,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PortalTab } from "./ClientPortalSidebar";
import { CompanyContextCard } from "./CompanyContextCard";
import { CollapsibleSection } from "./PortalUI";

interface ClientSettingsTabProps {
  userId: string;
  clientAccountId: string;
  onPreferencesChange?: (preferences: PortalPreferences) => void;
}

export interface PortalPreferences {
  theme: "light" | "dark" | "system";
  accent_color: string;
  layout_density: "compact" | "comfortable" | "spacious";
  default_landing_page: PortalTab;
  hidden_tabs: string[];
  pinned_sections: string[];
  email_notifications: boolean;
  notification_digest: "instant" | "daily" | "weekly";
  notify_on_messages: boolean;
  notify_on_approvals: boolean;
  notify_on_deliverables: boolean;
  notify_on_invoices: boolean;
  notify_on_meetings: boolean;
  activity_widget_types: string[];
  show_analytics_summary: boolean;
  show_quick_actions: boolean;
}

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

const accentColors = [
  { id: "default", label: "Default", color: "hsl(var(--primary))" },
  { id: "blue", label: "Blue", color: "hsl(217, 91%, 60%)" },
  { id: "green", label: "Green", color: "hsl(142, 71%, 45%)" },
  { id: "purple", label: "Purple", color: "hsl(262, 83%, 58%)" },
  { id: "orange", label: "Orange", color: "hsl(24, 95%, 53%)" },
  { id: "rose", label: "Rose", color: "hsl(346, 77%, 50%)" },
];

const landingPageOptions: { id: PortalTab; label: string }[] = [
  { id: "activity", label: "Activity Feed" },
  { id: "projects", label: "Your Agents" },
  { id: "messages", label: "Messages" },
  { id: "analytics", label: "Analytics" },
  { id: "notifications", label: "Wins & Updates" },
];

const tabOptions = [
  { id: "notifications", label: "Wins & Updates" },
  { id: "projects", label: "Your Agents" },
  { id: "messages", label: "Messages" },
  { id: "meetings", label: "Meetings" },
  { id: "approvals", label: "Approvals" },
  { id: "deliverables", label: "Deliverables" },
  { id: "documents", label: "Documents" },
  { id: "brand", label: "Brand Assets" },
  { id: "analytics", label: "Analytics" },
  { id: "invoices", label: "Invoices" },
];

const widgetOptions = [
  { id: "messages", label: "Recent Messages" },
  { id: "approvals", label: "Pending Approvals" },
  { id: "projects", label: "Agent Updates" },
  { id: "deliverables", label: "New Deliverables" },
  { id: "meetings", label: "Upcoming Meetings" },
];

export function ClientSettingsTab({ userId, clientAccountId, onPreferencesChange }: ClientSettingsTabProps) {
  const [preferences, setPreferences] = useState<PortalPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, [userId]);

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
        setPreferences({
          theme: data.theme as PortalPreferences["theme"],
          accent_color: data.accent_color,
          layout_density: data.layout_density as PortalPreferences["layout_density"],
          default_landing_page: data.default_landing_page as PortalTab,
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
        });
      }
    } catch (error) {
      console.error("Error fetching preferences:", error);
    } finally {
      setLoading(false);
    }
  };

  const updatePreference = <K extends keyof PortalPreferences>(key: K, value: PortalPreferences[K]) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const toggleArrayItem = (key: "hidden_tabs" | "activity_widget_types" | "pinned_sections", item: string) => {
    setPreferences(prev => {
      const array = prev[key];
      const newArray = array.includes(item)
        ? array.filter(i => i !== item)
        : [...array, item];
      return { ...prev, [key]: newArray };
    });
    setHasChanges(true);
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("client_portal_preferences")
        .upsert({
          user_id: userId,
          client_account_id: clientAccountId,
          ...preferences,
        }, { onConflict: "user_id" });

      if (error) throw error;

      toast({
        title: "Preferences saved",
        description: "Your portal preferences have been updated.",
      });
      setHasChanges(false);
      onPreferencesChange?.(preferences);
    } catch (error) {
      console.error("Error saving preferences:", error);
      toast({
        title: "Error saving preferences",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="border-0 bg-muted/30">
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-72" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Company Context */}
      <CompanyContextCard clientAccountId={clientAccountId} />

      {/* Save Button - Sticky */}
      {hasChanges && (
        <div className="sticky top-0 z-10 flex justify-end p-3 -m-3 mb-3 bg-background/80 backdrop-blur-sm border-b">
          <Button onClick={savePreferences} disabled={saving} className="gap-2 rounded-xl">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}

      {/* Default Landing Page */}
      <Card className="border-0 bg-muted/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layout className="h-5 w-5 text-primary" />
            Home Screen
          </CardTitle>
          <CardDescription>Choose what you see first when you log in</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={preferences.default_landing_page}
            onValueChange={(value) => updatePreference("default_landing_page", value as PortalTab)}
            className="grid grid-cols-2 sm:grid-cols-3 gap-2"
          >
            {landingPageOptions.map(({ id, label }) => (
              <Label
                key={id}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer transition-all text-sm",
                  preferences.default_landing_page === id
                    ? "border-primary bg-primary/5"
                    : "border-transparent bg-muted/50 hover:bg-muted"
                )}
              >
                <RadioGroupItem value={id} className="sr-only" />
                {label}
              </Label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card className="border-0 bg-muted/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Notifications
          </CardTitle>
          <CardDescription>Manage how you receive updates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Notifications Master Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
            <div>
              <Label className="text-sm font-medium">Email Notifications</Label>
              <p className="text-xs text-muted-foreground">Receive updates via email</p>
            </div>
            <Switch
              checked={preferences.email_notifications}
              onCheckedChange={(checked) => updatePreference("email_notifications", checked)}
            />
          </div>

          {preferences.email_notifications && (
            <>
              {/* Digest Frequency */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Notification Frequency</Label>
                <RadioGroup
                  value={preferences.notification_digest}
                  onValueChange={(value) => updatePreference("notification_digest", value as PortalPreferences["notification_digest"])}
                  className="flex gap-3"
                >
                  {[
                    { value: "instant", label: "Instant" },
                    { value: "daily", label: "Daily Digest" },
                    { value: "weekly", label: "Weekly Digest" },
                  ].map(({ value, label }) => (
                    <Label
                      key={value}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer transition-all",
                        preferences.notification_digest === value
                          ? "border-primary bg-primary/5"
                          : "border-transparent bg-muted/50 hover:bg-muted"
                      )}
                    >
                      <RadioGroupItem value={value} className="sr-only" />
                      <span className="text-sm font-medium">{label}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              {/* Notification Types */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Notify Me About</Label>
                <div className="space-y-2">
                  {[
                    { key: "notify_on_messages" as const, label: "New Messages" },
                    { key: "notify_on_approvals" as const, label: "Content Awaiting Approval" },
                    { key: "notify_on_deliverables" as const, label: "New Deliverables" },
                    { key: "notify_on_invoices" as const, label: "Invoice Updates" },
                    { key: "notify_on_meetings" as const, label: "Meeting Reminders" },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <Label className="text-sm">{label}</Label>
                      <Switch
                        checked={preferences[key]}
                        onCheckedChange={(checked) => updatePreference(key, checked)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Advanced: appearance, hidden sections, dashboard widgets — most clients never touch these */}
      <CollapsibleSection
        title="Advanced"
        subtitle="Appearance, hidden sections, and dashboard widgets"
        icon={Sparkles}
        defaultOpen={false}
      >
        <div className="space-y-8">
          {/* Appearance */}
          <div className="space-y-6">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              Appearance
            </h4>
            {/* Theme Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Theme</Label>
              <RadioGroup
                value={preferences.theme}
                onValueChange={(value) => updatePreference("theme", value as PortalPreferences["theme"])}
                className="grid grid-cols-3 gap-3"
              >
                {[
                  { value: "light", label: "Light", icon: Sun },
                  { value: "dark", label: "Dark", icon: Moon },
                  { value: "system", label: "System", icon: Monitor },
                ].map(({ value, label, icon: Icon }) => (
                  <Label
                    key={value}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all",
                      preferences.theme === value
                        ? "border-primary bg-primary/5"
                        : "border-transparent bg-muted/50 hover:bg-muted"
                    )}
                  >
                    <RadioGroupItem value={value} className="sr-only" />
                    <Icon className={cn("h-5 w-5", preferences.theme === value && "text-primary")} />
                    <span className="text-sm font-medium">{label}</span>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            {/* Accent Color */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Accent Color</Label>
              <div className="flex flex-wrap gap-3">
                {accentColors.map(({ id, label, color }) => (
                  <button
                    key={id}
                    onClick={() => updatePreference("accent_color", id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all",
                      preferences.accent_color === id
                        ? "border-primary bg-primary/5"
                        : "border-transparent bg-muted/50 hover:bg-muted"
                    )}
                  >
                    <div className="h-4 w-4 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Layout Density */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Layout Density</Label>
              <RadioGroup
                value={preferences.layout_density}
                onValueChange={(value) => updatePreference("layout_density", value as PortalPreferences["layout_density"])}
                className="flex gap-3"
              >
                {["compact", "comfortable", "spacious"].map((density) => (
                  <Label
                    key={density}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer capitalize transition-all",
                      preferences.layout_density === density
                        ? "border-primary bg-primary/5"
                        : "border-transparent bg-muted/50 hover:bg-muted"
                    )}
                  >
                    <RadioGroupItem value={density} className="sr-only" />
                    <span className="text-sm font-medium">{density}</span>
                  </Label>
                ))}
              </RadioGroup>
            </div>
          </div>

          {/* Hidden Tabs */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Layout className="h-4 w-4 text-primary" />
              Hide Sections
            </h4>
            <p className="text-xs text-muted-foreground">Select sections you don't use to hide them from the sidebar</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {tabOptions.map(({ id, label }) => (
                <Label
                  key={id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-sm",
                    preferences.hidden_tabs.includes(id)
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted/50 hover:bg-muted"
                  )}
                >
                  <Checkbox
                    checked={preferences.hidden_tabs.includes(id)}
                    onCheckedChange={() => toggleArrayItem("hidden_tabs", id)}
                  />
                  {label}
                </Label>
              ))}
            </div>
          </div>

          {/* Dashboard Widgets */}
          <div className="space-y-6">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-primary" />
              Dashboard Widgets
            </h4>
          {/* Quick Actions & Analytics Summary */}
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <Label className="text-sm font-medium">Analytics Summary</Label>
                <p className="text-xs text-muted-foreground">Show key metrics at the top</p>
              </div>
              <Switch
                checked={preferences.show_analytics_summary}
                onCheckedChange={(checked) => updatePreference("show_analytics_summary", checked)}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <Label className="text-sm font-medium">Quick Actions</Label>
                <p className="text-xs text-muted-foreground">Show quick action buttons</p>
              </div>
              <Switch
                checked={preferences.show_quick_actions}
                onCheckedChange={(checked) => updatePreference("show_quick_actions", checked)}
              />
            </div>
          </div>

          {/* Activity Widget Types */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Activity Feed Widgets</Label>
            <div className="grid grid-cols-2 gap-2">
              {widgetOptions.map(({ id, label }) => (
                <Label
                  key={id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-sm",
                    preferences.activity_widget_types.includes(id)
                      ? "bg-primary/10 text-primary border-2 border-primary"
                      : "bg-muted/50 hover:bg-muted border-2 border-transparent"
                  )}
                >
                  <Checkbox
                    checked={preferences.activity_widget_types.includes(id)}
                    onCheckedChange={() => toggleArrayItem("activity_widget_types", id)}
                  />
                  {label}
                </Label>
              ))}
            </div>
          </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Save Button - Bottom */}
      {hasChanges && (
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={savePreferences} disabled={saving} size="lg" className="gap-2 rounded-xl">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save All Changes"}
          </Button>
        </div>
      )}
    </div>
  );
}
