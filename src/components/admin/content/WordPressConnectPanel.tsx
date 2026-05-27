import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Plug, ExternalLink, RefreshCw, Eye, EyeOff } from "lucide-react";

interface Props {
  clientId: string;
  clientName?: string;
}

interface Creds {
  id?: string;
  wordpress_url: string;
  wordpress_plugin_api_key: string;
  wordpress_username: string;
  wordpress_app_password: string;
}

type ConnectionStatus = "idle" | "checking" | "connected" | "failed";

export function WordPressConnectPanel({ clientId, clientName }: Props) {
  const [creds, setCreds] = useState<Creds>({
    wordpress_url: "",
    wordpress_plugin_api_key: "",
    wordpress_username: "",
    wordpress_app_password: "",
  });
  const [saving, setSaving] = useState(false);
  const [showAppPassword, setShowAppPassword] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [statusDetail, setStatusDetail] = useState<string>("");

  useEffect(() => {
    loadCreds();
  }, [clientId]);

  async function loadCreds() {
    const { data } = await supabase
      .from("client_credentials")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();

    if (data) {
      setCreds({
        id: data.id,
        wordpress_url: data.wordpress_url ?? "",
        wordpress_plugin_api_key: (data as any).wordpress_plugin_api_key ?? "",
        wordpress_username: data.wordpress_username ?? "",
        wordpress_app_password: data.wordpress_app_password ?? "",
      });
    }
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        client_id: clientId,
        wordpress_url: creds.wordpress_url.trim().replace(/\/+$/, ""),
        wordpress_plugin_api_key: creds.wordpress_plugin_api_key.trim() || null,
        wordpress_username: creds.wordpress_username.trim() || null,
        wordpress_app_password: creds.wordpress_app_password.trim() || null,
      };

      const { error } = creds.id
        ? await supabase.from("client_credentials").update(payload).eq("id", creds.id)
        : await supabase.from("client_credentials").insert({ ...payload });

      if (error) throw error;
      toast.success("WordPress credentials saved");
      await loadCreds();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    if (!creds.wordpress_url) {
      toast.error("Enter the WordPress site URL first");
      return;
    }
    setStatus("checking");
    setStatusDetail("");
    try {
      const base = creds.wordpress_url.trim().replace(/\/+$/, "");

      if (creds.wordpress_plugin_api_key) {
        const res = await fetch(`${base}/wp-json/orangedoor/v1/status`, {
          headers: { "X-OD-API-Key": creds.wordpress_plugin_api_key },
        });
        if (!res.ok) throw new Error(`Plugin returned HTTP ${res.status}`);
        const data = await res.json();
        setStatus("connected");
        setStatusDetail(`Plugin v${data.version} · SEO plugin: ${data.active_seo_plugin}`);
      } else if (creds.wordpress_username && creds.wordpress_app_password) {
        const auth = "Basic " + btoa(`${creds.wordpress_username}:${creds.wordpress_app_password}`);
        const res = await fetch(`${base}/wp-json/wp/v2/users/me`, {
          headers: { Authorization: auth },
        });
        if (!res.ok) throw new Error(`Auth failed — HTTP ${res.status}`);
        const data = await res.json();
        setStatus("connected");
        setStatusDetail(`Connected as ${data.name}`);
      } else {
        throw new Error("Enter plugin API key or Basic Auth credentials first");
      }
    } catch (e) {
      setStatus("failed");
      setStatusDetail(e instanceof Error ? e.message : "Connection failed");
    }
  }

  const hasPlugin = !!creds.wordpress_plugin_api_key;
  const hasBasicAuth = !!creds.wordpress_username && !!creds.wordpress_app_password;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug className="h-4 w-4" />
            WordPress Integration
            {clientName && <span className="text-muted-foreground font-normal">— {clientName}</span>}
          </CardTitle>
          {status === "connected" && (
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
            </Badge>
          )}
          {status === "failed" && (
            <Badge variant="destructive">
              <XCircle className="h-3 w-3 mr-1" /> Failed
            </Badge>
          )}
        </div>
        {statusDetail && (
          <p className="text-xs text-muted-foreground">{statusDetail}</p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="wp-url">WordPress Site URL</Label>
          <Input
            id="wp-url"
            placeholder="https://clientsite.com"
            value={creds.wordpress_url}
            onChange={e => setCreds(p => ({ ...p, wordpress_url: e.target.value }))}
          />
        </div>

        <Tabs defaultValue="plugin">
          <TabsList className="w-full">
            <TabsTrigger value="plugin" className="flex-1">
              Plugin API Key {hasPlugin && <CheckCircle2 className="h-3 w-3 ml-1 text-emerald-500" />}
            </TabsTrigger>
            <TabsTrigger value="basic" className="flex-1">
              Basic Auth {hasBasicAuth && !hasPlugin && <CheckCircle2 className="h-3 w-3 ml-1 text-emerald-500" />}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="plugin" className="space-y-3 pt-3">
            <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
              <p className="font-medium">Setup steps:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Upload <code className="text-xs bg-muted px-1 rounded">orangedoor.php</code> to <code className="text-xs bg-muted px-1 rounded">wp-content/plugins/orangedoor/</code></li>
                <li>Activate the plugin in WordPress Admin → Plugins</li>
                <li>Go to <strong>Settings → OrangeDoor</strong> and copy the API Key</li>
                <li>Paste it below</li>
              </ol>
              <a
                href="https://orangedoor.marketing/wp-plugin"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline text-xs mt-1"
              >
                Download plugin <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plugin-key">Plugin API Key</Label>
              <Input
                id="plugin-key"
                placeholder="od_..."
                value={creds.wordpress_plugin_api_key}
                onChange={e => setCreds(p => ({ ...p, wordpress_plugin_api_key: e.target.value }))}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Preferred method — no admin credentials shared. Supports Yoast, RankMath, AIOSEO.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="basic" className="space-y-3 pt-3">
            <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-800 dark:text-amber-300">
              Use the plugin method when possible. Basic Auth requires sharing admin credentials.
            </div>
            <div className="space-y-2">
              <Label htmlFor="wp-user">WordPress Username</Label>
              <Input
                id="wp-user"
                placeholder="admin"
                value={creds.wordpress_username}
                onChange={e => setCreds(p => ({ ...p, wordpress_username: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wp-pass">Application Password</Label>
              <div className="relative">
                <Input
                  id="wp-pass"
                  type={showAppPassword ? "text" : "password"}
                  placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                  value={creds.wordpress_app_password}
                  onChange={e => setCreds(p => ({ ...p, wordpress_app_password: e.target.value }))}
                  className="font-mono text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowAppPassword(v => !v)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showAppPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Generate at Users → Profile → Application Passwords in WP Admin.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex gap-2 pt-1">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
          <Button
            variant="outline"
            onClick={testConnection}
            disabled={status === "checking"}
          >
            {status === "checking"
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Testing…</>
              : <><RefreshCw className="h-4 w-4" /> Test Connection</>
            }
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
