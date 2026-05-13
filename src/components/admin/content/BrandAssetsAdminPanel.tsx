import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { callAdminApi } from "@/lib/admin-api";
import { friendlyEdgeMessage } from "@/lib/edge-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Image, Type, Palette, FileText, Trash2, Globe, Building2, CheckCircle, Sparkles, AlertCircle, MessageSquare } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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
  created_at: string;
  client_accounts?: { business_name: string };
}

interface ClientAccount {
  id: string;
  business_name: string;
  website_url?: string | null;
}

const ASSET_TYPES = [
  { value: "logo", label: "Logo", icon: Image },
  { value: "color", label: "Color", icon: Palette },
  { value: "font", label: "Font", icon: Type },
  { value: "guideline", label: "Guideline", icon: FileText },
  { value: "icon", label: "Icon", icon: Image },
  { value: "template", label: "Template", icon: FileText },
  { value: "other", label: "Other", icon: FileText },
];

interface ExtractedAsset {
  id: string;
  name: string;
  asset_type: string;
  preview_url?: string;
}

function AssetStatusBadge({ status }: { status?: string }) {
  if (status === "pending_client") {
    return <Badge variant="outline" className="border-amber-400 text-amber-700 text-xs">Awaiting client</Badge>;
  }
  if (status === "confirmed") {
    return <Badge variant="outline" className="border-green-500 text-green-700 text-xs">Confirmed</Badge>;
  }
  return null;
}

function ColorSwatch({ asset, onDelete }: { asset: BrandAsset; onDelete: () => void }) {
  const hex = asset.metadata?.hex || "#cccccc";
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card group">
      <div className="h-12 w-12 rounded-md border flex-shrink-0" style={{ backgroundColor: hex }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{asset.name}</p>
        <p className="text-xs text-muted-foreground font-mono">{hex.toUpperCase()}</p>
        <AssetStatusBadge status={asset.metadata?.confirmation_status} />
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
          <AssetStatusBadge status={asset.metadata?.confirmation_status} />
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
        <div className="flex items-center gap-1 flex-wrap mt-0.5">
          <Badge variant="outline" className="text-xs">{ASSET_TYPES.find((t) => t.value === asset.asset_type)?.label}</Badge>
          <AssetStatusBadge status={asset.metadata?.confirmation_status} />
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
        setAssets((assetsRes.data as any).data);
      }
      if (clientsRes.data) {
        setClients(clientsRes.data);
        // Auto-fill website URL for single-client mode
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
          category: formData.asset_type === "logo" ? "logos" :
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
    if (asset.file_url) return asset.file_url;
    if (asset.file_path) {
      const { data } = supabase.storage.from("brand-assets").getPublicUrl(asset.file_path);
      return data.publicUrl;
    }
    return null;
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
        body: { client_account_id: extractClientId, website_url: extractUrl.trim() },
      });
      if (error) throw new Error(error.message || "Extraction failed");
      if (data?.error) throw new Error(data.error);
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

  const pendingCount = filteredAssets.filter((a) => a.metadata?.confirmation_status === "pending_client").length;

  // Brand DNA sections (only used in single-client mode)
  const logos = filteredAssets.filter((a) => a.asset_type === "logo");
  const colors = filteredAssets.filter((a) => a.asset_type === "color");
  const icons = filteredAssets.filter((a) => a.asset_type === "icon");
  const fonts = filteredAssets.filter((a) => a.asset_type === "font");
  const brandVoice = filteredAssets.filter((a) => ["headline", "description"].includes(a.asset_type));
  const other = filteredAssets.filter((a) =>
    !["logo", "color", "icon", "font", "headline", "description"].includes(a.asset_type)
  );

  const currentClient = clients.find((c) => c.id === clientId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ─── Extract dialog (shared) ───────────────────────────────────────────────
  const extractDialog = (
    <Dialog open={extractDialogOpen} onOpenChange={(o) => { if (!o) handleCloseExtractDialog(); else setExtractDialogOpen(true); }}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Extract Brand Assets from Website
          </DialogTitle>
          <DialogDescription>
            We'll scan the client's website and auto-detect logos, colors, and icons. The client confirms each asset in their portal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!clientId && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Client</label>
              <Select
                value={extractClientId}
                onValueChange={(v) => { setExtractClientId(v); setExtractedAssets([]); setExtractUrl(""); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
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
              Scanning website for brand assets…
            </div>
          )}

          {!extracting && extractedAssets.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-green-700 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                {extractedAssets.length} asset{extractedAssets.length !== 1 ? "s" : ""} extracted — saved as pending client confirmation
              </p>
              <div className="grid grid-cols-2 gap-3">
                {extractedAssets.map((a) => (
                  <div key={a.id} className="border rounded-lg p-3 flex items-center gap-3">
                    {a.asset_type === "color" ? (
                      <div className="h-10 w-10 rounded flex-shrink-0 border" style={{ backgroundColor: a.preview_url }} />
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
                These assets appear in the client portal under Brand Assets, marked "Awaiting Confirmation".
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

  // ─── Add Asset dialog (shared) ─────────────────────────────────────────────
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
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
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

        {pendingCount > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span><strong>{pendingCount}</strong> asset{pendingCount !== 1 ? "s" : ""} awaiting client confirmation in their portal.</span>
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
                {logos.length === 0 ? (
                  <EmptySection label="logos" />
                ) : (
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
                {colors.length === 0 ? (
                  <EmptySection label="colors" />
                ) : (
                  <div className="space-y-2">
                    {colors.map((a) => (
                      <ColorSwatch key={a.id} asset={a} onDelete={() => handleDelete(a.id, a.file_path)} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Icons / Favicons */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Image className="h-4 w-4 text-primary" />
                  Icons & Favicons
                </CardTitle>
              </CardHeader>
              <CardContent>
                {icons.length === 0 ? (
                  <EmptySection label="icons" />
                ) : (
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
                {fonts.length === 0 ? (
                  <EmptySection label="fonts" />
                ) : (
                  <div className="space-y-2">
                    {fonts.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card group">
                        <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Type className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ fontFamily: `"${a.metadata?.value || a.name}", sans-serif` }}>{a.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{a.metadata?.value || a.name}</p>
                          <AssetStatusBadge status={a.metadata?.confirmation_status} />
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
            {(brandVoice.length > 0 || other.length > 0) && (
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    Brand Voice & Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {brandVoice.map((a) => (
                      <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs capitalize">{a.asset_type}</Badge>
                            <AssetStatusBadge status={a.metadata?.confirmation_status} />
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
        )}
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
                  <div className="h-24 w-full" style={{ backgroundColor: asset.metadata?.hex || "#ccc" }} />
                ) : asset.asset_type === "logo" && url ? (
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
                        <AssetStatusBadge status={asset.metadata?.confirmation_status} />
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
