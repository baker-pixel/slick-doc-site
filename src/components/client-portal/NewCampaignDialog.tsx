import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";

// Field keys match the server's ColumnMapping (supabase/functions/_shared/leadImport.ts).
const FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "email", label: "Email", required: true },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "full_name", label: "Full name (if no first/last)" },
  { key: "company", label: "Company" },
  { key: "website", label: "Website" },
  { key: "title", label: "Job title" },
  { key: "note", label: "Personal note" },
];

const NONE = "__none";
const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface Summary {
  total_rows: number;
  accepted: number;
  invalid: number;
  duplicates_in_file: number;
  already_in_pipeline: number;
  unsubscribed: number;
  bounced: number;
  role_addresses: number;
  without_first_name: number;
}

interface Preview {
  headers: string[];
  mapping: Record<string, number>;
  summary: Summary;
  sample: { email: string; first_name: string; company: string }[];
  daily_cap: number;
  total_emails: number;
  estimated_days: number | null;
}

interface NeedsMapping {
  headers: string[];
  mapping: Record<string, number>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientAccountId: string;
  onCreated: () => void;
}

async function callCampaign(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("prospect-campaign", { body });
  const msg = await getEdgeErrorMessage(error, data);
  if (msg) throw new Error(friendlyEdgeMessage(msg));
  return data;
}

export function NewCampaignDialog({ open, onOpenChange, clientAccountId, onCreated }: Props) {
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<"cold" | "existing">("cold");
  const [source, setSource] = useState<"csv" | "discover">("csv");
  const [topic, setTopic] = useState("");
  const [details, setDetails] = useState("");
  const [steps, setSteps] = useState("3");

  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [mapping, setMapping] = useState<Record<string, number> | null>(null);
  const [mappingTouched, setMappingTouched] = useState(false);
  const [showMapping, setShowMapping] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [needsMapping, setNeedsMapping] = useState<NeedsMapping | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Existing contacts: always an uploaded list, shorter sequence by default.
  const changeAudience = (a: "cold" | "existing") => {
    setAudience(a);
    setSteps(a === "existing" ? "2" : "3");
    if (a === "existing") setSource("csv");
  };

  const reset = () => {
    setName(""); setAudience("cold"); setSource("csv"); setTopic(""); setDetails(""); setSteps("3");
    setFile(null); setMapping(null); setMappingTouched(false); setShowMapping(false);
    setPreview(null); setNeedsMapping(null); setPreviewError(null); setConsent(false);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setPreviewError("That file is too large (5 MB max).");
      return;
    }
    setFile({ name: f.name, text: await f.text() });
    setMapping(null); setMappingTouched(false); setPreview(null); setNeedsMapping(null); setPreviewError(null); setConsent(false);
    if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
  };

  // Re-run the server-side preview whenever the inputs that change its result change.
  const mappingKey = JSON.stringify(mappingTouched ? mapping : null);
  useEffect(() => {
    if (!open || source !== "csv" || !file) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPreviewing(true);
      setPreviewError(null);
      try {
        const data = await callCampaign({
          action: "preview_import",
          client_id: clientAccountId,
          csv: file.text,
          ...(mappingTouched && mapping ? { mapping } : {}),
          campaign: { audience, max_steps: Number(steps) },
        });
        if (cancelled) return;
        if (data.needs_mapping) {
          setNeedsMapping({ headers: data.headers, mapping: data.mapping });
          setMapping(data.mapping);
          setPreview(null);
          setShowMapping(true);
        } else {
          setNeedsMapping(null);
          setPreview(data as Preview);
          if (!mappingTouched) setMapping((data as Preview).mapping);
        }
      } catch (e) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source, file, audience, steps, mappingKey]);

  const headers = preview?.headers ?? needsMapping?.headers ?? [];

  const setField = (key: string, value: string) => {
    setMappingTouched(true);
    setConsent(false);
    setMapping((prev) => {
      const next = { ...(prev ?? {}) };
      if (value === NONE) delete next[key]; else next[key] = Number(value);
      return next;
    });
  };

  const baseOk = name.trim().length > 0 && (audience !== "existing" || topic.trim().length > 0);
  const csvOk = source !== "csv" || (!!preview && preview.summary.accepted > 0 && consent && !previewing);
  const canSubmit = baseOk && csvOk && !submitting;

  const submit = async () => {
    setSubmitting(true);
    try {
      const campaign = { name, audience, topic, topic_details: details, max_steps: Number(steps) };
      if (source === "csv") {
        const data = await callCampaign({
          action: "create_import_campaign",
          client_id: clientAccountId,
          csv: file!.text,
          filename: file!.name,
          mapping: preview!.mapping,
          consent: true,
          campaign,
        });
        toast({
          title: `${data.imported} contact${data.imported === 1 ? "" : "s"} added`,
          description: "Emails start after a 48-hour review window. You can pause the campaign any time before then.",
        });
      } else {
        const data = await callCampaign({ action: "create_discovery_campaign", client_id: clientAccountId, campaign });
        const d = data.discovery as { ok: boolean; discovered?: number; error?: string };
        toast({
          title: "Campaign created",
          description: d.ok ? `${d.discovered ?? 0} new leads found.` : `Leads weren't searched yet: ${d.error}`,
        });
      }
      onCreated();
      reset();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Couldn't create the campaign", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const s = preview?.summary;
  const skipped = useMemo(() => (s ? s.invalid + s.duplicates_in_file + s.already_in_pipeline + s.unsubscribed + s.bounced : 0), [s]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>A campaign is a group of people we email about one topic, from your own mailbox.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="cmp-name">Campaign name</Label>
            <Input id="cmp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New dashboard announcement" maxLength={120} />
          </div>

          <div className="space-y-2">
            <Label>Who is it for?</Label>
            <RadioGroup value={audience} onValueChange={(v) => changeAudience(v as "cold" | "existing")} className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-start gap-2 rounded-lg border p-3 text-sm cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <RadioGroupItem value="cold" className="mt-0.5" />
                <span><span className="font-medium">New prospects</span><br /><span className="text-muted-foreground text-xs">People who don't know you yet. We introduce you.</span></span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border p-3 text-sm cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <RadioGroupItem value="existing" className="mt-0.5" />
                <span><span className="font-medium">Existing customers or contacts</span><br /><span className="text-muted-foreground text-xs">People who know you. We announce, not pitch.</span></span>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cmp-topic">What are the emails about? {audience === "cold" && <span className="text-muted-foreground font-normal">(optional)</span>}</Label>
            <Input id="cmp-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Our new client reporting dashboard" maxLength={200} />
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Facts we may state in the emails: what it is, what it does, price, dates, link. We won't claim anything that isn't written here or in your Verified Facts."
              className="min-h-[88px] resize-none text-sm"
              maxLength={2000}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Emails per contact</Label>
              <Select value={steps} onValueChange={setSteps}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "email" : "emails"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Where do the contacts come from?</Label>
              <Select value={source} onValueChange={(v) => setSource(v as "csv" | "discover")} disabled={audience === "existing"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">I'll upload a CSV file</SelectItem>
                  <SelectItem value="discover">Find leads for me</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {source === "discover" && (
            <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 p-3">
              We'll search for businesses that match your ideal customer profile and tag them to this campaign. They go through the
              normal lead review before anything is sent.
            </p>
          )}

          {source === "csv" && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium text-foreground">File format:</span> a CSV with one row per person and a header row.
                  Only <code className="rounded bg-muted px-1">email</code> is required. These optional columns make the emails better:{" "}
                  <code className="rounded bg-muted px-1">first_name</code> <code className="rounded bg-muted px-1">last_name</code>{" "}
                  <code className="rounded bg-muted px-1">company</code> <code className="rounded bg-muted px-1">website</code>{" "}
                  <code className="rounded bg-muted px-1">title</code> <code className="rounded bg-muted px-1">note</code>
                  {" "}(a personal line about them, like "met at the May summit", that we use to open the email).
                </p>
                <p>
                  Column names are matched automatically, and you can fix any we get wrong after uploading.{" "}
                  <a href="/sample-contacts.csv" download="sample-contacts.csv" className="font-medium text-primary underline underline-offset-2 hover:no-underline">
                    Download a sample CSV
                  </a>
                  {" "}(opens in Excel or Google Sheets; it uses fake addresses, so replace them with your own).
                </p>
              </div>
              <input ref={fileInput} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex w-full items-center gap-3 rounded-lg border border-dashed p-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {file ? <FileSpreadsheet className="h-5 w-5 text-primary" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
                <span className="text-sm">
                  {file ? <><span className="font-medium">{file.name}</span><span className="text-muted-foreground"> · click to replace</span></> : <><span className="font-medium">Choose a CSV file</span><br /><span className="text-xs text-muted-foreground">CSV, up to 5 MB.</span></>}
                </span>
              </button>

              {previewing && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking your list…</p>}
              {previewError && <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{previewError}</p>}

              {needsMapping && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                  We couldn't find an email column. Pick which column holds the email address below.
                </p>
              )}

              {headers.length > 0 && (
                <div className="rounded-lg border p-3 space-y-2">
                  <button type="button" onClick={() => setShowMapping((v) => !v)} className="text-sm font-medium underline-offset-2 hover:underline">
                    {showMapping ? "Hide columns" : "Check which columns we're using"}
                  </button>
                  {showMapping && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {FIELDS.map((f) => (
                        <div key={f.key} className="space-y-1">
                          <Label className="text-xs">{f.label}{f.required && " *"}</Label>
                          <Select value={mapping?.[f.key] !== undefined ? String(mapping[f.key]) : NONE} onValueChange={(v) => setField(f.key, v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>Not in my file</SelectItem>
                              {headers.map((h, i) => <SelectItem key={i} value={String(i)}>{h || `Column ${i + 1}`}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {s && preview && (
                <div className="rounded-lg border p-4 space-y-3 text-sm">
                  <p>
                    <span className="text-2xl font-semibold tabular-nums">{s.accepted.toLocaleString()}</span>{" "}
                    <span className="text-muted-foreground">of {s.total_rows.toLocaleString()} contacts ready to email</span>
                  </p>
                  {skipped > 0 && (
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      <li className="font-medium text-foreground">{skipped.toLocaleString()} skipped:</li>
                      {s.invalid > 0 && <li>{s.invalid} missing or invalid email</li>}
                      {s.duplicates_in_file > 0 && <li>{s.duplicates_in_file} duplicates in your file</li>}
                      {s.already_in_pipeline > 0 && <li>{s.already_in_pipeline} already in your outreach</li>}
                      {s.unsubscribed > 0 && <li>{s.unsubscribed} have unsubscribed (we never email them again)</li>}
                      {s.bounced > 0 && <li>{s.bounced} previously bounced</li>}
                    </ul>
                  )}
                  {s.role_addresses > 0 && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">{s.role_addresses} are shared inboxes (info@, sales@…). They usually perform poorly.</p>
                  )}
                  {s.without_first_name > 0 && s.accepted > 0 && (
                    <p className="text-xs text-muted-foreground">{s.without_first_name} have no first name, so they'll get "Hi there,".</p>
                  )}
                  {s.accepted > 0 && preview.estimated_days !== null && (
                    <p className="text-xs text-muted-foreground">
                      To protect your mailbox we send at most {preview.daily_cap} emails a day, so {preview.total_emails.toLocaleString()} emails
                      take about {preview.estimated_days} {preview.estimated_days === 1 ? "day" : "days"}. The first go out after a 48-hour review window.
                    </p>
                  )}
                  {preview.sample.length > 0 && (
                    <div className="text-xs text-muted-foreground border-t pt-2">
                      Preview: {preview.sample.map((l) => l.first_name || l.email).slice(0, 3).join(", ")}
                      {s.accepted > 3 ? ` and ${(s.accepted - 3).toLocaleString()} more` : ""}
                    </div>
                  )}
                  <label className="flex items-start gap-2 border-t pt-3 cursor-pointer">
                    <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
                    <span className="text-xs">
                      I confirm I have permission to email everyone on this list, and I understand each email includes an unsubscribe link that we honor.
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {source === "csv" ? "Start campaign" : "Create campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
