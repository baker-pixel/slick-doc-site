import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Globe, Instagram, Linkedin, Facebook, MapPin, Eye, EyeOff, Save, Loader2 } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

interface ClientAccessTabProps {
  clientAccountId: string;
}

interface PostingPreferences {
  instagram: boolean;
  linkedin: boolean;
  facebook: boolean;
  google_business: boolean;
  self_post: boolean;
  posting_days: string[];
}

interface OAuthToken {
  id: string;
  platform: string;
  access_token: string | null;
  token_metadata: Record<string, unknown> | null;
}

interface WordPressCredentials {
  id?: string;
  wordpress_url: string;
  wordpress_username: string;
  wordpress_app_password: string;
}

const PLATFORMS = [
  { key: "instagram" as const, label: "Instagram", icon: Instagram },
  { key: "facebook" as const, label: "Facebook", icon: Facebook },
  { key: "linkedin" as const, label: "LinkedIn", icon: Linkedin },
  { key: "google_business" as const, label: "Google Business", icon: MapPin },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const defaultPrefs: PostingPreferences = {
  instagram: false,
  linkedin: false,
  facebook: false,
  google_business: false,
  self_post: false,
  posting_days: [],
};

export function ClientAccessTab({ clientAccountId }: ClientAccessTabProps) {
  const [loading, setLoading] = useState(true);
  const [savingSocial, setSavingSocial] = useState(false);
  const [savingWp, setSavingWp] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [prefs, setPrefs] = useState<PostingPreferences>(defaultPrefs);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [wp, setWp] = useState<WordPressCredentials>({ wordpress_url: "", wordpress_username: "", wordpress_app_password: "" });
  const [wpId, setWpId] = useState<string | null>(null);
  const [showWpPassword, setShowWpPassword] = useState(false);

  useEffect(() => {
    loadAll();
  }, [clientAccountId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [accountRes, tokensRes, credRes] = await Promise.all([
        supabase
          .from("client_accounts")
          .select("posting_preferences")
          .eq("id", clientAccountId)
          .single(),
        supabase
          .from("client_oauth_tokens")
          .select("*")
          .eq("client_id", clientAccountId),
        supabase
          .from("client_credentials")
          .select("*")
          .eq("client_id", clientAccountId)
          .limit(1),
      ]);

      if (accountRes.data?.posting_preferences) {
        const raw = accountRes.data.posting_preferences as unknown as PostingPreferences;
        setPrefs({ ...defaultPrefs, ...raw });
      }

      if (tokensRes.data) {
        const tokenMap: Record<string, string> = {};
        (tokensRes.data as OAuthToken[]).forEach((t) => {
          tokenMap[t.platform] = t.access_token || "";
        });
        setTokens(tokenMap);
      }

      if (credRes.data && credRes.data.length > 0) {
        const c = credRes.data[0];
        setWp({
          wordpress_url: c.wordpress_url || "",
          wordpress_username: c.wordpress_username || "",
          wordpress_app_password: c.wordpress_app_password || "",
        });
        setWpId(c.id);
      }
    } catch (err) {
      console.error("Error loading access data:", err);
    } finally {
      setLoading(false);
    }
  };

  // --- Section A: Social preferences & tokens ---
  const handleSaveSocial = async () => {
    setSavingSocial(true);
    try {
      // Save posting preferences
      const { error: prefsError } = await supabase
        .from("client_accounts")
        .update({ posting_preferences: prefs as unknown as Json })
        .eq("id", clientAccountId);

      if (prefsError) throw prefsError;

      // Upsert OAuth tokens for enabled platforms
      for (const platform of PLATFORMS) {
        const enabled = prefs[platform.key];
        const tokenValue = tokens[platform.key];

        if (enabled && tokenValue) {
          // Check if token row exists
          const { data: existing } = await supabase
            .from("client_oauth_tokens")
            .select("id")
            .eq("client_id", clientAccountId)
            .eq("platform", platform.key)
            .limit(1);

          if (existing && existing.length > 0) {
            await supabase
              .from("client_oauth_tokens")
              .update({ access_token: tokenValue, updated_at: new Date().toISOString() })
              .eq("id", existing[0].id);
          } else {
            await supabase
              .from("client_oauth_tokens")
              .insert({ client_id: clientAccountId, platform: platform.key, access_token: tokenValue });
          }
        }
      }

      toast.success("Social media preferences saved");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save social preferences");
    } finally {
      setSavingSocial(false);
    }
  };

  // --- Section B: WordPress credentials ---
  const handleSaveWp = async () => {
    setSavingWp(true);
    try {
      if (wpId) {
        const { error } = await supabase
          .from("client_credentials")
          .update({
            wordpress_url: wp.wordpress_url || null,
            wordpress_username: wp.wordpress_username || null,
            wordpress_app_password: wp.wordpress_app_password || null,
            updated_at: new Date().toISOString(),
          } as Record<string, unknown>)
          .eq("id", wpId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("client_credentials")
          .insert({
            client_id: clientAccountId,
            wordpress_url: wp.wordpress_url || null,
            wordpress_username: wp.wordpress_username || null,
            wordpress_app_password: wp.wordpress_app_password || null,
          } as Record<string, unknown>)
          .select("id")
          .single();
        if (error) throw error;
        if (data) setWpId(data.id);
      }
      toast.success("Website credentials saved");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save website credentials");
    } finally {
      setSavingWp(false);
    }
  };

  // --- Section C: Posting schedule ---
  const toggleDay = (day: string) => {
    setPrefs((prev) => {
      const days = prev.posting_days.includes(day)
        ? prev.posting_days.filter((d) => d !== day)
        : [...prev.posting_days, day];
      return { ...prev, posting_days: days };
    });
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const { error } = await supabase
        .from("client_accounts")
        .update({ posting_preferences: prefs as unknown as Json })
        .eq("id", clientAccountId);
      if (error) throw error;
      toast.success("Posting schedule saved");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save posting schedule");
    } finally {
      setSavingSchedule(false);
    }
  };

  const enabledPlatforms = PLATFORMS.filter((p) => prefs[p.key]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Platform Access</h2>
        <p className="text-muted-foreground">
          Connect your accounts so we can create and publish content on your behalf.
        </p>
      </div>

      {/* Section A — Social Media Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Social Media Preferences</CardTitle>
          <CardDescription>
            Choose which platforms you'd like us to post on for you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {PLATFORMS.map((platform) => {
            const Icon = platform.icon;
            const enabled = prefs[platform.key];

            return (
              <div key={platform.key} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <Label htmlFor={`toggle-${platform.key}`} className="font-medium cursor-pointer">
                      Would you like us to post on {platform.label} for you?
                    </Label>
                  </div>
                  <Switch
                    id={`toggle-${platform.key}`}
                    checked={enabled}
                    onCheckedChange={(checked) =>
                      setPrefs((prev) => ({ ...prev, [platform.key]: checked }))
                    }
                  />
                </div>

                {enabled ? (
                  <div className="ml-8 space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Connect {platform.label} — paste your access token
                    </Label>
                    <Input
                      placeholder={`${platform.label} access token`}
                      value={tokens[platform.key] || ""}
                      onChange={(e) =>
                        setTokens((prev) => ({ ...prev, [platform.key]: e.target.value }))
                      }
                    />
                  </div>
                ) : (
                  <p className="ml-8 text-sm text-muted-foreground italic">
                    We'll generate content for you to post yourself.
                  </p>
                )}
              </div>
            );
          })}

          <div className="flex justify-end pt-2">
            <Button onClick={handleSaveSocial} disabled={savingSocial}>
              {savingSocial ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Social Preferences
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section B — Website Access */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="h-5 w-5" />
            Website Access
          </CardTitle>
          <CardDescription>
            Provide your WordPress credentials so we can publish blog posts and page updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>WordPress Site URL</Label>
            <Input
              placeholder="https://yoursite.com"
              value={wp.wordpress_url}
              onChange={(e) => setWp((prev) => ({ ...prev, wordpress_url: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>WordPress Username</Label>
            <Input
              placeholder="admin"
              value={wp.wordpress_username}
              onChange={(e) => setWp((prev) => ({ ...prev, wordpress_username: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>WordPress Application Password</Label>
            <div className="relative">
              <Input
                type={showWpPassword ? "text" : "password"}
                placeholder="xxxx xxxx xxxx xxxx"
                value={wp.wordpress_app_password}
                onChange={(e) =>
                  setWp((prev) => ({ ...prev, wordpress_app_password: e.target.value }))
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowWpPassword(!showWpPassword)}
              >
                {showWpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Generate an application password in WordPress under Users → Profile → Application Passwords.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSaveWp} disabled={savingWp}>
              {savingWp ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Website Credentials
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section C — Posting Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Posting Schedule</CardTitle>
          <CardDescription>
            Choose which days of the week you'd like us to post on your enabled platforms.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {enabledPlatforms.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Enable at least one social platform above to set a posting schedule.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Select preferred posting days for:{" "}
                {enabledPlatforms.map((p) => p.label).join(", ")}
              </p>
              <div className="flex flex-wrap gap-3">
                {DAYS.map((day) => (
                  <label
                    key={day}
                    className="flex items-center gap-2 cursor-pointer select-none"
                  >
                    <Checkbox
                      checked={prefs.posting_days.includes(day)}
                      onCheckedChange={() => toggleDay(day)}
                    />
                    <span className="text-sm font-medium">{day}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSaveSchedule}
              disabled={savingSchedule || enabledPlatforms.length === 0}
            >
              {savingSchedule ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Schedule
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
