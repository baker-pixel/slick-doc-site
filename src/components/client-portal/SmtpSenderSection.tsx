import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { Link2, Unlink, RefreshCw, CheckCircle2, AlertTriangle, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SmtpToken {
  id: string;
  platform: string;
  page_id: string | null;
  token_metadata: Record<string, unknown> | null;
}

// SMTP credentials for lead outreach are stored as a row in the same
// client_oauth_tokens table the social platforms use (platform: "smtp") --
// it already has full client-owned RLS (select/insert/update/delete scoped
// to the client's own client_id), so no new table or migration is needed.
// access_token holds the SMTP password; page_id holds the from-address;
// host/port/username/secure/from_name live in token_metadata.
const SMTP_PRESETS: Record<string, { label: string; host: string; port: number; secure: boolean }> = {
  gmail: { label: "Gmail", host: "smtp.gmail.com", port: 465, secure: true },
  outlook: { label: "Outlook / Microsoft 365", host: "smtp.office365.com", port: 587, secure: false },
  custom: { label: "Custom SMTP server", host: "", port: 587, secure: false },
};

interface SmtpFormState {
  preset: string;
  fromName: string;
  fromEmail: string;
  host: string;
  port: string;
  username: string;
  password: string;
  secure: boolean;
}

const EMPTY_SMTP_FORM: SmtpFormState = {
  preset: "gmail",
  fromName: "",
  fromEmail: "",
  host: SMTP_PRESETS.gmail.host,
  port: String(SMTP_PRESETS.gmail.port),
  username: "",
  password: "",
  secure: SMTP_PRESETS.gmail.secure,
};

export function SmtpSenderSection({ clientAccountId, onConnectionChange }: { clientAccountId: string; onConnectionChange?: (connected: boolean) => void }) {
  const [smtpToken_, setSmtpToken_] = useState<SmtpToken | null>(null);
  const [tokenLoaded, setTokenLoaded] = useState(false);
  const [smtpDialogOpen, setSmtpDialogOpen] = useState(false);
  const [smtpForm, setSmtpForm] = useState<SmtpFormState>(EMPTY_SMTP_FORM);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [disconnectingEmail, setDisconnectingEmail] = useState(false);

  const fetchSmtpToken = async () => {
    const { data, error } = await supabase
      .from("client_oauth_tokens")
      .select("id, platform, page_id, token_metadata")
      .eq("client_id", clientAccountId)
      .eq("platform", "smtp")
      .maybeSingle();
    if (error) {
      console.error("Error fetching SMTP token:", error);
      return;
    }
    setSmtpToken_((data as SmtpToken | null) ?? null);
    setTokenLoaded(true);
  };

  useEffect(() => {
    if (tokenLoaded) onConnectionChange?.(!!smtpToken_);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smtpToken_, tokenLoaded]);

  useEffect(() => {
    fetchSmtpToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientAccountId]);

  const openSmtpDialog = () => {
    const existing = smtpToken_;
    const meta = (existing?.token_metadata ?? {}) as Record<string, unknown>;
    setSmtpForm(
      existing
        ? {
            preset: "custom",
            fromName: typeof meta.from_name === "string" ? meta.from_name : "",
            fromEmail: existing.page_id ?? "",
            host: typeof meta.host === "string" ? meta.host : "",
            port: typeof meta.port === "number" ? String(meta.port) : "",
            username: typeof meta.username === "string" ? meta.username : "",
            password: "", // never pre-fill a stored secret back into the form
            secure: meta.secure === true,
          }
        : EMPTY_SMTP_FORM,
    );
    setSmtpDialogOpen(true);
  };

  const handleSmtpPresetChange = (preset: string) => {
    const p = SMTP_PRESETS[preset];
    setSmtpForm((prev) => ({
      ...prev,
      preset,
      ...(p ? { host: p.host, port: String(p.port), secure: p.secure } : {}),
    }));
  };

  const handleSaveSmtp = async () => {
    const { fromEmail, host, port, username, password } = smtpForm;
    const portNum = Number(port);
    const isEditing = !!smtpToken_;
    if (!fromEmail || !host || !portNum || !username || (!password && !isEditing)) {
      toast({ title: "Missing fields", description: "From email, host, port, username, and password are all required.", variant: "destructive" });
      return;
    }

    setSavingSmtp(true);
    try {
      const { error } = await supabase.from("client_oauth_tokens").upsert(
        {
          client_id: clientAccountId,
          platform: "smtp",
          // Omitted (blank) on edit -- PostgREST upsert only overwrites
          // columns present in the payload, so this leaves the previously
          // saved password untouched instead of wiping it to null.
          ...(password ? { access_token: password } : {}),
          page_id: fromEmail,
          token_metadata: {
            host,
            port: portNum,
            username,
            secure: smtpForm.secure,
            from_name: smtpForm.fromName || null,
            // Reset on every save -- new/changed credentials haven't been
            // proven to actually send yet. Set to true only by a successful
            // test-client-smtp run.
            verified: false,
          },
        },
        { onConflict: "client_id,platform" },
      );
      if (error) throw error;

      await fetchSmtpToken();
      setSmtpDialogOpen(false);
      toast({ title: "Email connected", description: "Lead outreach will now send from this address." });
    } catch (err) {
      console.error("Error saving SMTP credentials:", err);
      toast({
        title: "Could not save",
        description: err instanceof Error ? err.message : "Please check your details and try again.",
        variant: "destructive",
      });
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-client-smtp", {
        body: { clientId: clientAccountId },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Test send failed. Double-check host, port, and password.");
      }
      toast({ title: "Test email sent", description: "Check your inbox to confirm it arrived." });
    } catch (err) {
      toast({
        title: "Test failed",
        description: err instanceof Error ? err.message : "Please check your SMTP details.",
        variant: "destructive",
      });
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleDisconnectEmail = async () => {
    const token = smtpToken_;
    if (!token) return;
    setDisconnectingEmail(true);
    try {
      const { error } = await supabase.from("client_oauth_tokens").delete().eq("id", token.id);
      if (error) throw error;
      setSmtpToken_(null);
      toast({ title: "Disconnected", description: "Lead outreach is paused until you reconnect a mailbox." });
    } catch (err) {
      console.error("Error disconnecting email:", err);
      toast({ title: "Error", description: "Failed to disconnect. Please try again.", variant: "destructive" });
    } finally {
      setDisconnectingEmail(false);
    }
  };

  return (
    <>
      {/* Email for lead outreach (SMTP) */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Mail className="h-4.5 w-4.5 text-primary" />
          Email for Lead Outreach
        </h3>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          Connect your own inbox via SMTP so outreach emails to prospects send from your address.
          Required — lead outreach will not send until a mailbox is connected.
        </p>
        {(() => {
          const smtpToken = smtpToken_;
          const meta = (smtpToken?.token_metadata ?? {}) as Record<string, unknown>;
          const mailbox = smtpToken?.page_id;
          return (
            <Card className={cn("relative overflow-hidden border transition-all duration-200", smtpToken ? "border-primary/30 shadow-sm" : "border-border/50")}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2.5 rounded-xl shrink-0", smtpToken ? "bg-primary/10" : "bg-muted")}>
                    <Mail className={cn("h-5 w-5", smtpToken ? "text-primary" : "text-muted-foreground")} />
                  </div>
                  <div>
                    <CardTitle className="text-base">SMTP Email Sender</CardTitle>
                    {smtpToken && meta.verified === true ? (
                      <Badge variant="outline" className="mt-1 text-xs bg-green-500/10 text-green-600 border-green-500/20 gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Connected & verified
                      </Badge>
                    ) : smtpToken ? (
                      <Badge variant="outline" className="mt-1 text-xs bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1">
                        <AlertTriangle className="h-3 w-3" /> Needs verification -- send a test email
                      </Badge>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">Not connected</p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Works with Gmail, Outlook, or any custom SMTP server. Gmail and Outlook both require an app password, not your regular login password.
                </p>
                {smtpToken && mailbox && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 text-sm">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    <span className="text-muted-foreground">Sending as:</span>
                    <span className="font-medium truncate">{typeof meta.from_name === "string" && meta.from_name ? `${meta.from_name} <${mailbox}>` : mailbox}</span>
                  </div>
                )}
                {smtpToken && meta.verified !== true && typeof meta.last_test_error === "string" && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 text-sm text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>Last test failed: {meta.last_test_error}</span>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={openSmtpDialog}>
                    <Link2 className="h-3.5 w-3.5" />
                    {smtpToken ? "Edit" : "Connect"}
                  </Button>
                  {smtpToken && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
                      onClick={handleDisconnectEmail}
                      disabled={disconnectingEmail}
                    >
                      <Unlink className="h-3.5 w-3.5" />
                      {disconnectingEmail ? "Disconnecting..." : "Disconnect"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })()}
      </div>

      {/* SMTP connect/edit dialog */}
      <Dialog open={smtpDialogOpen} onOpenChange={(open) => { if (!savingSmtp) setSmtpDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Connect your email
            </DialogTitle>
            <DialogDescription>
              Credentials are used only to send outreach emails on your behalf and stay tied to your account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-preset">Provider</Label>
              <Select value={smtpForm.preset} onValueChange={handleSmtpPresetChange}>
                <SelectTrigger id="smtp-preset"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SMTP_PRESETS).map(([key, p]) => (
                    <SelectItem key={key} value={key}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {smtpForm.preset !== "custom" && (
                <p className="text-xs text-muted-foreground">
                  Use an app password, not your regular login password. {smtpForm.preset === "gmail" ? "Create one in your Google Account → Security → App passwords." : "Create one in your Microsoft 365 account security settings."}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="smtp-from-name">From name</Label>
                <Input id="smtp-from-name" value={smtpForm.fromName} onChange={(e) => setSmtpForm((p) => ({ ...p, fromName: e.target.value }))} placeholder="Jane Smith" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-from-email">From email</Label>
                <Input id="smtp-from-email" type="email" value={smtpForm.fromEmail} onChange={(e) => setSmtpForm((p) => ({ ...p, fromEmail: e.target.value }))} placeholder="jane@yourbusiness.com" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="smtp-host">SMTP host</Label>
                <Input id="smtp-host" value={smtpForm.host} onChange={(e) => setSmtpForm((p) => ({ ...p, host: e.target.value }))} placeholder="smtp.example.com" disabled={smtpForm.preset !== "custom"} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-port">Port</Label>
                <Input id="smtp-port" value={smtpForm.port} onChange={(e) => setSmtpForm((p) => ({ ...p, port: e.target.value }))} placeholder="587" disabled={smtpForm.preset !== "custom"} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-username">Username</Label>
              <Input id="smtp-username" value={smtpForm.username} onChange={(e) => setSmtpForm((p) => ({ ...p, username: e.target.value }))} placeholder="Usually your full email address" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-password">Password</Label>
              <Input id="smtp-password" type="password" value={smtpForm.password} onChange={(e) => setSmtpForm((p) => ({ ...p, password: e.target.value }))} placeholder={smtpToken_ ? "Leave blank to keep current password" : ""} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2">
              <Label htmlFor="smtp-secure" className="text-sm font-normal">Use TLS (port 465)</Label>
              <Switch id="smtp-secure" checked={smtpForm.secure} onCheckedChange={(v) => setSmtpForm((p) => ({ ...p, secure: v }))} disabled={smtpForm.preset !== "custom"} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2 sm:justify-between">
            {smtpToken_ && (
              <Button variant="outline" size="sm" onClick={handleTestSmtp} disabled={testingSmtp || savingSmtp} className="gap-1.5">
                <RefreshCw className={cn("h-3.5 w-3.5", testingSmtp && "animate-spin")} />
                {testingSmtp ? "Sending..." : "Send test email"}
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" onClick={() => setSmtpDialogOpen(false)} disabled={savingSmtp}>Cancel</Button>
              <Button onClick={handleSaveSmtp} disabled={savingSmtp} className="gap-1.5">
                {savingSmtp ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving...</> : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
