import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { callAdminApi } from "@/lib/admin-api";
import { friendlyEdgeMessage } from "@/lib/edge-error";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Image, Type, Palette, FileText, Trash2, Upload, Building2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

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

export default function BrandAssetsAdminPanel({ clientId }: { clientId?: string } = {}) {
  const { adminPassword } = useAdminAuth();
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filterClient, setFilterClient] = useState<string>(clientId || "all");
  const [formData, setFormData] = useState({
    client_account_id: "",
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
          .select("id, business_name")
          .order("business_name"),
      ]);

      if (assetsRes.data && (assetsRes.data as any)?.data) {
        setAssets((assetsRes.data as any).data);
      }
      if (clientsRes.data) {
        setClients(clientsRes.data);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData({ ...formData, file });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client_account_id || !formData.name) return;

    setSubmitting(true);
    try {
      let filePath = null;
      let fileUrl = formData.file_url || null;

      // Upload file if provided
      if (formData.file) {
        setUploading(true);
        const fileExt = formData.file.name.split(".").pop();
        const fileName = `${formData.client_account_id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("brand-assets")
          .upload(fileName, formData.file);

        if (uploadError) throw uploadError;
        filePath = fileName;
        setUploading(false);
      }

      const { data, error } = await callAdminApi(adminPassword, {
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

      toast({ title: "Asset created", description: "Brand asset has been added successfully." });
      setFormData({
        client_account_id: "",
        name: "",
        description: "",
        asset_type: "logo",
        file: null,
        file_url: "",
        is_primary: false,
        color_hex: "",
      });
      setDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error("Error creating asset:", error);
      toast({ title: "Error", description: error.message || "Failed to create asset", variant: "destructive" });
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const handleDelete = async (assetId: string, filePath: string | null) => {
    if (!confirm("Are you sure you want to delete this asset?")) return;

    try {
      const adminPassword = localStorage.getItem("admin_password");
      
      // Delete file from storage if exists
      if (filePath) {
        await supabase.storage.from("brand-assets").remove([filePath]);
      }

      const { error } = await supabase.functions.invoke("admin", {
        body: {
          action: "delete_brand_asset",
          password: adminPassword,
          id: assetId,
        },
      });

      if (error) throw error;

      toast({ title: "Asset deleted" });
      fetchData();
    } catch (error) {
      console.error("Error deleting asset:", error);
      toast({ title: "Error", description: "Failed to delete asset", variant: "destructive" });
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

  const filteredAssets = filterClient === "all" 
    ? assets 
    : assets.filter((a) => a.client_account_id === filterClient);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
                <SelectItem key={client.id} value={client.id}>
                  {client.business_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Asset
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Add Brand Asset</DialogTitle>
                <DialogDescription>
                  Upload a new brand asset for a client
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
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
                        <SelectItem key={client.id} value={client.id}>
                          {client.business_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Asset Type</label>
                    <Select
                      value={formData.asset_type}
                      onValueChange={(value) => setFormData({ ...formData, asset_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSET_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
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
                    placeholder="Optional description..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={2}
                  />
                </div>

                {formData.asset_type === "color" ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Color Hex Value</label>
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
                        placeholder="https://..."
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
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting || !formData.client_account_id || !formData.name}>
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {uploading ? "Uploading..." : "Add Asset"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {filteredAssets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Palette className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No brand assets</h3>
            <p className="text-muted-foreground text-center">
              Add brand assets for your clients to access
            </p>
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
                  <div
                    className="h-24 w-full"
                    style={{ backgroundColor: asset.metadata?.hex || "#ccc" }}
                  />
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
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{asset.name}</p>
                        {asset.is_primary && <Badge variant="secondary" className="shrink-0">Primary</Badge>}
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