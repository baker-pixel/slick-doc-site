import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { callAdminApi } from "@/lib/admin-api";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, Plus, Image, Type, Palette, FileText, Trash2, Globe,
  Building2, CheckCircle, Sparkles, AlertCircle, MessageSquare,
  Clock, BarChart2, Eye, Volume2, BookOpen, CheckCircle2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface BrandAsset {
  id: string;
  client_account_id: string;
  name: string;
  description: string | null;
  asset_type: string;
  category: string;
  file_path: string | null;
  file_url: string | null;
  metadata: Record<string, any>;
  is_primary: boolean;
  confirmed: boolean;
  created_at: string;
  updated_at: string;
  client_accounts?: { business_name: string };
  signedUrl?: string;
}

interface ClientAccount {
  id: string;
  business_name: string;
  website_url?: string | null;
}

const ASSET_TYPES = [
  { value: "logo", label: "Logo", icon: Image },
  { value: "og_image", label: "Social Image", icon: Image },
  { value: "color", label: "Color", icon: Palette },
  { value: "font", label: "Font", icon: Type },
  { value: "guideline", label: "Guideline", icon: FileText },
  { value: "icon", label: "Icon", icon: Image },
  { value: "brand_voice", label: "Brand Voice", icon: Volume2 },
  { value: "template", label: "Template", icon: FileText },
  { value: "other", label: "Other", icon: FileText },
];

interface ExtractedAsset {
  id: string;
  name: string;
  asset_type: string;
  preview_url?: string;
}

function AssetStatusBadge({ asset }: { asset: BrandAsset }) {
  if (asset.confirmed) {
    return <Badge variant="outline" className="border-green-500 text-green-700 text-xs">Confirmed</Badge>;
  }
  if (asset.metadata?.confirmation_status === "pending_client") {
    return <Badge variant="outline" className="border-amber-400 text-amber-700 text-xs">Awaiting client</Badge>;
  }
  return null;
}

function completenessScore(assets: BrandAsset[]): { score: number; counts: Record<string, number> } {
  const confirmed = assets.filter((a) => a.confirmed);
  const hasLogo = confirmed.some((a) => a.asset_type === "logo" || a.asset_type === "icon" || a.asset_type === "og_image") ? 20 : 0;
  const colors = confirmed.filter((a) => a.asset_type === "color").length;
  const hasColors = colors >= 3 ? 20 : 0;
  const hasFont = confirmed.some((a) => a.asset_type === "font") ? 15 : 0;
  const hasVoice = confirmed.some((a) => a.asset_type === "brand_voice") ? 30 : 0;
  const hasValueProp = confirmed.some((a) => a.asset_type === "brand_voice" && a.metadata?.sub_type === "value_proposition") ? 15 : 0;

  const counts: Record<string, number> = {
    logo: confirmed.filter((a) => a.asset_type === "logo" || a.asset_type === "icon" || a.asset_type === "og_image").length,
    color: confirmed.filter((a) => a.asset_type === "color").length,
    font: confirmed.filter((a) => a.asset_type === "font").length,
    brand_voice: confirmed.filter((a) => a.asset_type === "brand_voice").length,
    pending: assets.filter((a) => !a.confirmed).length,
    total: assets.length,
  };

  return { score: hasLogo + hasColors + hasFont + hasVoice + hasValueProp, counts };
}

function ColorSwatch({ asset, onDelete }: { asset: BrandAsset; onDelete: () => void }) {
  const hex = asset.metadata?.hex || asset.metadata?.value || "#cccccc";
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card group">
      <div className="h-12 w-12 rounded-md border flex-shrink-0" style={{ backgroundColor: hex }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{asset.name}</p>
        <p className="text-xs text-muted-foreground font-mono">{hex.toUpperCase()}</p>
        <AssetStatusBadge asset={asset} />
      </div>
      <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive h-7 w-7 shrink-0" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ImageAsset({ asset, url, onDelete }: { asset: BrandAsset; url: string | null; onDelete: () => void }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden group">
      <div className="h-20 bg-muted/40 flex items-center justify-center p-3">
        {url ? (
          <img src={url} alt={asset.name} className="max-h-full max-w-full object-contain" />
        ) : (
          <Image className="h-8 w-8 text-muted-foreground" />
        )}
      </div>
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium truncate">{asset.name}</p>
          <AssetStatusBadge asset={asset} />
        </div>
        <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive h-6 w-6 shrink-0" onClick={onDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function OtherAsset({ asset, onDelete }: { asset: BrandAsset; onDelete: () => void }) {
  const TypeIcon = ASSET_TYPES.find((t) => t.value === asset.asset_type)?.icon || FileText;
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card group">
      <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
        <TypeIcon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{asset.name}</p>
        {asset.asset_type === "brand_voice" && asset.metadata?.sub_type && (
          <p className="text-xs text-muted-foreground capitalize">{asset.metadata.sub_type.replace(/_/g, " ")}</p>
        )}
        <div className="flex items-center gap-1 flex-wrap mt-0.5">
          <Badge variant="outline" className="text-xs">{ASSET_TYPES.find((t) => t.value === asset.asset_type)?.label}</Badge>
          <AssetStatusBadge asset={asset} />
        </div>
      </div>
      <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive h-7 w-7 shrink-0" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function EmptySection({ label }: { label: string }) {
  return (
    <p className="text-xs text-muted-foreground italic py-2">No {label.toLowerCase()} detected yet</p>
  );
}

export default function BrandAssetsAdminPanel({ clientId }: { clientId?: string } = {}) {
  const { adminPassword } = useAdminAuth();
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filterClient, setFilterClient] = useState<string>(clientId || "all");
  const [kitPreviewOpen, setKitPreviewOpen] = useState(false);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [extractDialogOpen, setExtractDialogOpen] = useState(false);
  const [extractClientId, setExtractClientId] = useState(clientId || "");
  const [extractUrl, setExtractUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractedAssets, setExtractedAssets] = useState<ExtractedAsset[]>([]);
  const [formData, setFormData] = useState({
    client_account_id: clientId || "",
    name: "",
    description: "",
    asset_type: "logo",
    file: null as File | null,
    file_url: "",
    is_primary: false,
    color_hex: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [assetsRes, clientsRes] = await Promise.all([
        callAdminApi(adminPassword, { action: "get_brand_assets" }),
        supabase
          .from("client_accounts")
          .select("id, business_name, website_url")
          .order("business_name"),
      ]);

      if (assetsRes.data && (assetsRes.data as any)?.data) {
        const rows = (assetsRes.data as any).data as BrandAsset[];
        setAssets(rows);
      }
      if (clientsRes.data) {
        setClients(clientsRes.data);
        if (clientId) {
          const found = clientsRes.data.find((c) => c.id === clientId);
          if (found?.website_url) setExtractUrl(found.website_url);
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setFormData({ ...formData, file });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client_account_id || !formData.name) return;

    setSubmitting(true);
    try {
      let filePath = null;
      let fileUrl = formData.file_url || null;

      if (formData.file) {
        setUploading(true);
        const fileExt = formData.file.name.split(".").pop();
        const fileName = `${formData.client_account_id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("brand-assets").upload(fileName, formData.file);
        if (uploadError) throw uploadError;
        filePath = fileName;
        setUploading(false);
      }

      const metadata: Record<string, any> = {};
      if (formData.asset_type === "color" && formData.color_hex) {
        metadata.hex = formData.color_hex;
      }

      const { error } = await callAdminApi(adminPassword, {
        action: "create_brand_asset",
        data: {
          client_account_id: formData.client_account_id,
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          asset_type: formData.asset_type,
          category: (formData.asset_type === "logo" || formData.asset_type === "icon") ? "logos" :
                   formData.asset_type === "color" ? "colors" :
                   formData.asset_type === "font" ? "fonts" : "guidelines",
          file_path: filePath,
          file_url: fileUrl,
          metadata,
          is_primary: formData.is_primary,
        },
      });

      if (error) throw new Error(error);

      toast({ title: "Asset created", description: "Brand asset added successfully." });
      setFormData({ client_account_id: clientId || "", name: "", description: "", asset_type: "logo", file: null, file_url: "", is_primary: false, color_hex: "" });
      setDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create asset", variant: "destructive" });
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const handleConfirmAsset = async (assetId: string) => {
    setConfirmingId(assetId);
    try {
      const { error } = await callAdminApi(adminPassword, { action: "confirm_brand_asset", id: assetId });
      if (error) throw new Error(error);
      toast({ title: "Asset confirmed" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to confirm asset", variant: "destructive" });
    } finally {
      setConfirmingId(null);
    }
  };

  const handleDelete = async (assetId: string, filePath: string | null) => {
    if (!confirm("Delete this asset?")) return;
    try {
      if (filePath) await supabase.storage.from("brand-assets").remove([filePath]);
      const { error } = await callAdminApi(adminPassword, { action: "delete_brand_asset", id: assetId });
      if (error) throw new Error(error);
      toast({ title: "Asset deleted" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: friendlyEdgeMessage(error.message || "Failed to delete asset"), variant: "destructive" });
    }
  };

  const getFileUrl = (asset: BrandAsset) => {
    return asset.signedUrl || asset.file_url || null;
  };

  const handleExtract = async () => {
    if (!extractClientId || !extractUrl.trim()) {
      toast({ title: "Select a client and enter a website URL", variant: "destructive" });
      return;
    }
    setExtracting(true);
    setExtractedAssets([]);
    try {
      const { data, error } = await supabase.functions.invoke("extract-brand-assets", {
        body: { client_account_id: extractClientId, website_url: extractUrl.trim(), password: adminPassword },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Extraction failed");
      }
      setExtractedAssets(data?.assets || []);
      if ((data?.assets || []).length === 0) {
        toast({ title: "No brand assets found", description: data?.message || "Try a different URL", variant: "destructive" });
      } else {
        toast({ title: `${data.assets.length} asset${data.assets.length !== 1 ? "s" : ""} extracted`, description: "Client will be asked to confirm in their portal." });
        fetchData();
      }
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const handleCloseExtractDialog = () => {
    setExtractDialogOpen(false);
    setExtractedAssets([]);
    if (!clientId) {
      setExtractUrl("");
      setExtractClientId("");
    }
  };

  const openExtractDialog = () => {
    if (clientId) setExtractClientId(clientId);
    setExtractDialogOpen(true);
  };

  const filteredAssets = clientId
    ? assets.filter((a) => a.client_account_id === clientId)
    : filterClient === "all" ? assets : assets.filter((a) => a.client_account_id === filterClient);

  const pendingCount = filteredAssets.filter((a) => !a.confirmed).length;

  const logos = filteredAssets.filter((a) => a.asset_type === "logo" || a.asset_type === "og_image");
  const colors = filteredAssets.filter((a) => a.asset_type === "color");
  const icons = filteredAssets.filter((a) => a.asset_type === "icon");
  const fonts = filteredAssets.filter((a) => a.asset_type === "font");
  const brandVoice = filteredAssets.filter((a) => a.asset_type === "brand_voice");
  const legacyVoice = filteredAssets.filter((a) => ["headline", "description"].includes(a.asset_type));
  const other = filteredAssets.filter((a) =>
    !["logo", "og_image", "color", "icon", "font", "brand_voice", "headline", "description"].includes(a.asset_type)
  );

  const currentClient = clients.find((c) => c.id === clientId);
  const { score: kitScore, counts } = completenessScore(filteredAssets);

  const lastExtracted = filteredAssets
    .filter((a) => a.metadata?.scraped_from)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ─── Extract dialog ────────────────────────────────────────────────────────
  const extractDialog = (
    <Dialog open={extractDialogOpen} onOpenChange={(o) => { if (!o) handleCloseExtractDialog(); else setExtractDialogOpen(true); }}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Extract Brand Assets from Website
          </DialogTitle>
          <DialogDescription>
            Scans the client's website for logos, colors, fonts, and brand voice signals. Client confirms each asset in their portal. Safe to re-run — duplicates are deduped automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!clientId && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Client</label>
              <Select
                value={extractClientId}
                onValueChange={(v) => {
                  setExtractClientId(v);
                  setExtractedAssets([]);
                  const found = clients.find((c) => c.id === v);
                  setExtractUrl(found?.website_url || "");
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Website URL</label>
            <div className="flex gap-2">
              <Input
                placeholder="https://clientwebsite.com"
                value={extractUrl}
                onChange={(e) => { setExtractUrl(e.target.value); setExtractedAssets([]); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleExtract(); } }}
              />
              <Button onClick={handleExtract} disabled={extracting || !extractClientId || !extractUrl.trim()}>
                {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {extracting && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning website and extracting brand signals…
            </div>
          )}

          {!extracting && extractedAssets.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-green-700 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                {extractedAssets.length} asset{extractedAssets.length !== 1 ? "s" : ""} extracted — awaiting client confirmation
              </p>
              <div className="grid grid-cols-2 gap-3">
                {extractedAssets.map((a) => (
                  <div key={a.id} className="border rounded-lg p-3 flex items-center gap-3">
                    {a.asset_type === "color" ? (
                      <div className="h-10 w-10 rounded flex-shrink-0 border" style={{ backgroundColor: a.preview_url }} />
                    ) : a.asset_type === "brand_voice" ? (
                      <div className="h-10 w-10 rounded bg-muted flex-shrink-0 flex items-center justify-center">
                        <Volume2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                    ) : a.preview_url ? (
                      <div className="h-10 w-10 rounded bg-muted flex-shrink-0 flex items-center justify-center overflow-hidden">
                        <img src={a.preview_url} alt={a.name} className="max-h-full max-w-full object-contain" />
                      </div>
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex-shrink-0 flex items-center justify-center">
                        <Image className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.name}</p>
                      <Badge variant="outline" className="text-xs">{a.asset_type}</Badge>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Assets appear in the client portal under Brand Assets, marked "Awaiting Confirmation".
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={handleCloseExtractDialog}>
            {extractedAssets.length > 0 ? "Done" : "Cancel"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // ─── Add Asset dialog ──────────────────────────────────────────────────────
  const addDialog = (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Add Asset
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Brand Asset</DialogTitle>
          <DialogDescription>Upload a new brand asset for a client</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {!clientId && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Client</label>
              <Select
                value={formData.client_account_id}
                onValueChange={(value) => setFormData({ ...formData, client_account_id: value })}
              >
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>{client.business_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Asset Type</label>
              <Select
                value={formData.asset_type}
                onValueChange={(value) => setFormData({ ...formData, asset_type: value })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="e.g., Primary Logo"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              placeholder="Optional description…"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>

          {formData.asset_type === "color" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Color</label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={formData.color_hex || "#000000"}
                  onChange={(e) => setFormData({ ...formData, color_hex: e.target.value })}
                  className="w-14 h-10 p-1"
                />
                <Input
                  placeholder="#000000"
                  value={formData.color_hex}
                  onChange={(e) => setFormData({ ...formData, color_hex: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Upload File</label>
                <Input type="file" onChange={handleFileChange} accept="image/*,.pdf,.ttf,.otf,.woff,.woff2" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Or External URL</label>
                <Input
                  placeholder="https://…"
                  value={formData.file_url}
                  onChange={(e) => setFormData({ ...formData, file_url: e.target.value })}
                />
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="is_primary"
              checked={formData.is_primary}
              onCheckedChange={(checked) => setFormData({ ...formData, is_primary: !!checked })}
            />
            <label htmlFor="is_primary" className="text-sm">Mark as primary asset</label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting || (!clientId && !formData.client_account_id) || !formData.name}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {uploading ? "Uploading…" : "Add Asset"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );

  // ─── SINGLE CLIENT — Brand DNA view ───────────────────────────────────────
  if (clientId) {
    return (
      <div className="space-y-6">
        {extractDialog}

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Brand DNA</h2>
            <p className="text-muted-foreground text-sm flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              {currentClient?.business_name || "Client"}
            </p>
          </div>
          <div className="flex gap-2">
            {addDialog}
            <Button onClick={openExtractDialog}>
              <Globe className="h-4 w-4 mr-2" />
              Extract from Website
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <BarChart2 className="h-4 w-4" />
                <span className="text-xs">Kit Score</span>
              </div>
              <p className="text-2xl font-bold">{kitScore}%</p>
              <Progress value={kitScore} className="h-1.5 mt-1" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <CheckCircle className="h-4 w-4" />
                <span className="text-xs">Confirmed</span>
              </div>
              <p className="text-2xl font-bold">{filteredAssets.filter((a) => a.confirmed).length}</p>
              <p className="text-xs text-muted-foreground">{counts.pending} pending</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Palette className="h-4 w-4" />
                <span className="text-xs">Colors</span>
              </div>
              <p className="text-2xl font-bold">{counts.color}</p>
              <p className="text-xs text-muted-foreground">{counts.font} font{counts.font !== 1 ? "s" : ""}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs">Last extracted</span>
              </div>
              {lastExtracted ? (
                <p className="text-sm font-medium">
                  {formatDistanceToNow(new Date(lastExtracted.updated_at), { addSuffix: true })}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Never</p>
              )}
            </CardContent>
          </Card>
        </div>

        {pendingCount > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800 text-sm space-y-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span><strong>{pendingCount}</strong> asset{pendingCount !== 1 ? "s" : ""} awaiting confirmation — confirm on behalf of client or let them confirm in their portal.</span>
            </div>
            <div className="space-y-1.5">
              {filteredAssets.filter((a) => !a.confirmed).map((a) => {
                const colorVal = a.asset_type === "color" ? (a.metadata?.hex || a.metadata?.value) : null;
                return (
                  <div key={a.id} className="flex items-center gap-2 bg-white/60 rounded-md px-3 py-2">
                    {colorVal ? (
                      <div className="h-6 w-6 rounded border flex-shrink-0" style={{ backgroundColor: colorVal }} />
                    ) : (
                      <div className="h-6 w-6 rounded bg-amber-100 border border-amber-300 flex-shrink-0 flex items-center justify-center">
                        {a.asset_type === "brand_voice" ? <Volume2 className="h-3 w-3" /> :
                         (a.asset_type === "logo" || a.asset_type === "icon" || a.asset_type === "og_image") ? <Image className="h-3 w-3" /> :
                         a.asset_type === "font" ? <Type className="h-3 w-3" /> :
                         <FileText className="h-3 w-3" />}
                      </div>
                    )}
                    <span className="flex-1 text-xs font-medium truncate">{a.name}</span>
                    <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 shrink-0">
                      {ASSET_TYPES.find((t) => t.value === a.asset_type)?.label || a.asset_type}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs border-green-400 text-green-700 hover:bg-green-50 shrink-0"
                      disabled={confirmingId === a.id}
                      onClick={() => handleConfirmAsset(a.id)}
                    >
                      {confirmingId === a.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                      )}
                      Confirm
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {filteredAssets.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <Palette className="h-14 w-14 text-muted-foreground" />
              <div className="text-center">
                <h3 className="text-lg font-medium mb-1">No brand assets yet</h3>
                <p className="text-muted-foreground text-sm mb-4">Extract them automatically from the client's website or add manually.</p>
              </div>
              <Button onClick={openExtractDialog}>
                <Globe className="h-4 w-4 mr-2" />
                Extract from Website
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Brand Kit Preview */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Asset Library</h3>
              <Button size="sm" variant="outline" onClick={() => setKitPreviewOpen(true)}>
                <Eye className="h-4 w-4 mr-2" />
                Kit Preview
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Logo */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Image className="h-4 w-4 text-primary" />
                    Logo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {logos.length === 0 ? <EmptySection label="logos" /> : (
                    <div className="grid grid-cols-2 gap-3">
                      {logos.map((a) => (
                        <ImageAsset key={a.id} asset={a} url={getFileUrl(a)} onDelete={() => handleDelete(a.id, a.file_path)} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Colors */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Palette className="h-4 w-4 text-primary" />
                    Colors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {colors.length === 0 ? <EmptySection label="colors" /> : (
                    <div className="space-y-2">
                      {colors.map((a) => (
                        <ColorSwatch key={a.id} asset={a} onDelete={() => handleDelete(a.id, a.file_path)} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Icons */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Image className="h-4 w-4 text-primary" />
                    Icons & Favicons
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {icons.length === 0 ? <EmptySection label="icons" /> : (
                    <div className="grid grid-cols-3 gap-3">
                      {icons.map((a) => (
                        <ImageAsset key={a.id} asset={a} url={getFileUrl(a)} onDelete={() => handleDelete(a.id, a.file_path)} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Typography */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Type className="h-4 w-4 text-primary" />
                    Typography
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {fonts.length === 0 ? <EmptySection label="fonts" /> : (
                    <div className="space-y-2">
                      {fonts.map((a) => (
                        <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card group">
                          <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Type className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ fontFamily: `"${a.metadata?.value || a.name}", sans-serif` }}>{a.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{a.metadata?.value || a.name}</p>
                            <AssetStatusBadge asset={a} />
                          </div>
                          <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive h-7 w-7 shrink-0" onClick={() => handleDelete(a.id, a.file_path)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Brand Voice */}
              {(brandVoice.length > 0 || legacyVoice.length > 0 || other.length > 0) && (
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Volume2 className="h-4 w-4 text-primary" />
                      Brand Voice & Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={brandVoice.length > 2 ? "grid grid-cols-2 gap-3" : "space-y-3"}>
                      {brandVoice.map((a) => {
                        const v = a.metadata?.value;
                        const display = Array.isArray(v) ? (v as string[]).join(", ") : (typeof v === "string" ? v : a.name);
                        return (
                          <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card group">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs capitalize">
                                  {a.metadata?.sub_type?.replace(/_/g, " ") || "brand voice"}
                                </Badge>
                                <AssetStatusBadge asset={a} />
                              </div>
                              <p className="text-sm text-foreground leading-relaxed">{display}</p>
                            </div>
                            <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive h-7 w-7 shrink-0 mt-0.5" onClick={() => handleDelete(a.id, a.file_path)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                      {legacyVoice.map((a) => (
                        <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card group">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs capitalize">{a.asset_type}</Badge>
                              <AssetStatusBadge asset={a} />
                            </div>
                            <p className="text-sm text-foreground leading-relaxed">{a.metadata?.value || a.name}</p>
                          </div>
                          <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive h-7 w-7 shrink-0 mt-0.5" onClick={() => handleDelete(a.id, a.file_path)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      {other.map((a) => (
                        <OtherAsset key={a.id} asset={a} onDelete={() => handleDelete(a.id, a.file_path)} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}

        {/* Brand Kit Preview Dialog */}
        <Dialog open={kitPreviewOpen} onOpenChange={setKitPreviewOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                Brand Kit Preview
              </DialogTitle>
              <DialogDescription>
                What the AI agents see for {currentClient?.business_name || "this client"}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2 text-sm">
              <div>
                <p className="font-medium mb-2 text-xs uppercase tracking-wide text-muted-foreground">Visual</p>
                <div className="flex gap-2 flex-wrap">
                  {colors.filter((a) => a.confirmed).map((a) => {
                    const colorVal = a.metadata?.hex || a.metadata?.value || "#cccccc";
                    return (
                      <div key={a.id} className="flex items-center gap-1.5 rounded-md border px-2 py-1">
                        <div className="h-4 w-4 rounded border flex-shrink-0" style={{ backgroundColor: colorVal }} />
                        <span className="text-xs font-mono">{colorVal.toUpperCase()}</span>
                      </div>
                    );
                  })}
                  {fonts.filter((a) => a.confirmed).map((a) => (
                    <Badge key={a.id} variant="outline" className="text-xs">{a.metadata?.value || a.name}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-medium mb-2 text-xs uppercase tracking-wide text-muted-foreground">Voice</p>
                <div className="space-y-2">
                  {brandVoice.filter((a) => a.confirmed).map((a) => {
                    const v = a.metadata?.value;
                    const display = Array.isArray(v) ? (v as string[]).join(", ") : (typeof v === "string" ? v : a.name);
                    return (
                      <div key={a.id} className="flex gap-2">
                        <Badge variant="secondary" className="text-xs shrink-0 capitalize">
                          {a.metadata?.sub_type?.replace(/_/g, " ") || "voice"}
                        </Badge>
                        <p className="text-xs text-muted-foreground">{display}</p>
                      </div>
                    );
                  })}
                  {brandVoice.filter((a) => a.confirmed).length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No confirmed brand voice assets yet. Run extraction first.</p>
                  )}
                </div>
              </div>
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">Kit completeness: <strong>{kitScore}%</strong></p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── ALL CLIENTS — flat grid view ─────────────────────────────────────────
  return (
    <div className="space-y-6">
      {extractDialog}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Brand Assets</h2>
          <p className="text-muted-foreground">{assets.length} assets across {clients.length} clients</p>
        </div>
        <div className="flex gap-3">
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>{client.business_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setExtractDialogOpen(true)}>
            <Globe className="h-4 w-4 mr-2" />
            Extract from Website
          </Button>
          {addDialog}
        </div>
      </div>

      {filteredAssets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Palette className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No brand assets</h3>
            <p className="text-muted-foreground text-center">Add brand assets for your clients to access</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAssets.map((asset) => {
            const url = getFileUrl(asset);
            const TypeIcon = ASSET_TYPES.find((t) => t.value === asset.asset_type)?.icon || FileText;

            return (
              <Card key={asset.id} className="overflow-hidden">
                {asset.asset_type === "color" ? (
                  <div className="h-24 w-full" style={{ backgroundColor: asset.metadata?.hex || asset.metadata?.value || "#ccc" }} />
                ) : (asset.asset_type === "logo" || asset.asset_type === "og_image") && url ? (
                  <div className="h-24 bg-muted/50 flex items-center justify-center p-4">
                    <img src={url} alt={asset.name} className="max-h-full max-w-full object-contain" />
                  </div>
                ) : (
                  <div className="h-24 bg-muted/50 flex items-center justify-center">
                    <TypeIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{asset.name}</p>
                        {asset.is_primary && <Badge variant="secondary" className="shrink-0">Primary</Badge>}
                        <AssetStatusBadge asset={asset} />
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Building2 className="h-3 w-3" />
                        {asset.client_accounts?.business_name}
                      </p>
                      <Badge variant="outline" className="mt-2 text-xs">
                        {ASSET_TYPES.find((t) => t.value === asset.asset_type)?.label}
                      </Badge>
                    </div>
                    <Button size="icon" variant="ghost" className="shrink-0 text-destructive hover:text-destructive" onClick={() => handleDelete(asset.id, asset.file_path)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
