import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Download, Image, Type, Palette, FileText, Copy, Check, ExternalLink, Upload, Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface BrandAsset {
  id: string;
  name: string;
  description: string | null;
  asset_type: string;
  category: string;
  file_path: string | null;
  file_url: string | null;
  metadata: Record<string, any>;
  is_primary: boolean;
  created_at: string;
}

const ASSET_TYPE_CONFIG: Record<string, { label: string; icon: typeof Image }> = {
  logo: { label: "Logo", icon: Image },
  font: { label: "Font", icon: Type },
  color: { label: "Color", icon: Palette },
  guideline: { label: "Guideline", icon: FileText },
  icon: { label: "Icon", icon: Image },
  template: { label: "Template", icon: FileText },
  other: { label: "Other", icon: FileText },
};

const CATEGORY_TABS = [
  { value: "all", label: "All Assets" },
  { value: "logos", label: "Logos" },
  { value: "colors", label: "Colors" },
  { value: "fonts", label: "Fonts" },
  { value: "guidelines", label: "Guidelines" },
];

interface ClientBrandAssetsTabProps {
  clientAccountId: string;
}

export default function ClientBrandAssetsTab({ clientAccountId }: ClientBrandAssetsTabProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    name: "",
    asset_type: "logo",
    description: "",
    colorValue: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAssets();
  }, [clientAccountId]);

  const fetchAssets = async () => {
    try {
      const { data, error } = await supabase
        .from("brand_assets")
        .select("*")
        .eq("client_account_id", clientAccountId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAssets((data || []) as BrandAsset[]);
    } catch (error) {
      console.error("Error fetching brand assets:", error);
    } finally {
      setLoading(false);
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

  const handleUpload = async () => {
    if (!uploadForm.name.trim()) {
      toast({ title: "Please enter an asset name", variant: "destructive" });
      return;
    }

    if (uploadForm.asset_type === "color" && !uploadForm.colorValue.trim()) {
      toast({ title: "Please enter a color value", variant: "destructive" });
      return;
    }

    if (uploadForm.asset_type !== "color" && !selectedFile) {
      toast({ title: "Please select a file to upload", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      let filePath: string | null = null;
      
      // Upload file if not a color asset
      if (selectedFile && uploadForm.asset_type !== "color") {
        const fileExt = selectedFile.name.split(".").pop();
        const fileName = `${clientAccountId}/${Date.now()}-${uploadForm.name.replace(/\s+/g, "-")}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("brand-assets")
          .upload(fileName, selectedFile);

        if (uploadError) throw uploadError;
        filePath = fileName;
      }

      // Create the brand asset record
      const metadata = uploadForm.asset_type === "color" 
        ? { hex: uploadForm.colorValue, value: uploadForm.colorValue }
        : {};

      const { error: insertError } = await supabase
        .from("brand_assets")
        .insert({
          client_account_id: clientAccountId,
          name: uploadForm.name,
          description: uploadForm.description || null,
          asset_type: uploadForm.asset_type,
          category:
            uploadForm.asset_type === "logo" || uploadForm.asset_type === "icon"
              ? "logos"
              : uploadForm.asset_type === "color"
              ? "colors"
              : uploadForm.asset_type === "font"
              ? "fonts"
              : "guidelines",
          file_path: filePath,
          metadata,
        });

      if (insertError) throw insertError;

      // Auto-complete the client_upload workflow step if it's still pending
      try {
        const { data: wf } = await supabase
          .from("client_workflows")
          .select("id")
          .eq("client_id", clientAccountId)
          .eq("status", "active")
          .maybeSingle();

        if (wf) {
          await supabase
            .from("workflow_steps")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("workflow_id", wf.id)
            .eq("task_type", "client_upload")
            .neq("status", "completed");
          // Invalidate workflow queries so Activity tab refreshes
          queryClient.invalidateQueries({ queryKey: ["client-workflow", clientAccountId] });
          queryClient.invalidateQueries({ queryKey: ["onboarding-complete", clientAccountId] });
        }
      } catch (e) {
        // Non-fatal — step completion is best-effort
      }

      toast({ title: "Asset uploaded successfully!" });
      setUploadDialogOpen(false);
      resetUploadForm();
      fetchAssets();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (assetId: string, filePath: string | null) => {
    if (!confirm("Are you sure you want to delete this asset?")) return;

    try {
      // Delete from storage if file exists
      if (filePath) {
        await supabase.storage.from("brand-assets").remove([filePath]);
      }

      // Delete from database
      const { error } = await supabase
        .from("brand_assets")
        .delete()
        .eq("id", assetId);

      if (error) throw error;
      
      toast({ title: "Asset deleted" });
      fetchAssets();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast({ title: "Failed to delete asset", variant: "destructive" });
    }
  };

  const handleDownload = async (asset: BrandAsset) => {
    const url = getFileUrl(asset);
    if (!url) {
      toast({ title: "No file available", variant: "destructive" });
      return;
    }

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      // Preserve original extension from file_path
      const ext = asset.file_path ? "." + asset.file_path.split(".").pop() : "";
      a.download = asset.name + ext;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      toast({ title: "Download started", description: asset.name });
    } catch (error) {
      console.error("Download error:", error);
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  const resetUploadForm = () => {
    setUploadForm({ name: "", asset_type: "logo", description: "", colorValue: "" });
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) resetUploadForm();
    setUploadDialogOpen(open);
  };

  const handleCopyColor = (colorValue: string, assetId: string) => {
    navigator.clipboard.writeText(colorValue);
    setCopiedId(assetId);
    toast({ title: "Color copied", description: colorValue });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredAssets = activeCategory === "all" 
    ? assets 
    : assets.filter((a) => a.category === activeCategory || a.asset_type === activeCategory.slice(0, -1));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const logoAssets = assets.filter((a) => a.asset_type === "logo" || a.asset_type === "icon");
  const colorAssets = assets.filter((a) => a.asset_type === "color");
  const fontAssets = assets.filter((a) => a.asset_type === "font");
  const guidelineAssets = assets.filter(
    (a) => a.asset_type === "guideline" || a.asset_type === "template" || a.asset_type === "other"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Brand Assets</h2>
          <p className="text-muted-foreground">Upload and manage your brand logos, colors, fonts, and guidelines</p>
        </div>
        <Button onClick={() => setUploadDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Upload Asset
        </Button>
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Brand Asset</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="asset-name">Asset Name *</Label>
              <Input
                id="asset-name"
                value={uploadForm.name}
                onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                placeholder="e.g., Primary Logo, Brand Blue"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="asset-type">Asset Type *</Label>
              <Select
                value={uploadForm.asset_type}
                onValueChange={(value) => setUploadForm({ ...uploadForm, asset_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="logo">Logo</SelectItem>
                  <SelectItem value="color">Color</SelectItem>
                  <SelectItem value="font">Font</SelectItem>
                  <SelectItem value="guideline">Guideline / Document</SelectItem>
                  <SelectItem value="icon">Icon</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {uploadForm.asset_type === "color" ? (
              <div className="space-y-2">
                <Label htmlFor="color-value">Color Value (Hex) *</Label>
                <div className="flex gap-2">
                  <Input
                    id="color-value"
                    value={uploadForm.colorValue}
                    onChange={(e) => setUploadForm({ ...uploadForm, colorValue: e.target.value })}
                    placeholder="#FF5500"
                  />
                  {uploadForm.colorValue && (
                    <div
                      className="h-10 w-10 rounded border flex-shrink-0"
                      style={{ backgroundColor: uploadForm.colorValue }}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>File *</Label>
                <div 
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={
                      uploadForm.asset_type === "logo" || uploadForm.asset_type === "icon"
                        ? "image/*,.svg"
                        : uploadForm.asset_type === "font"
                        ? ".ttf,.otf,.woff,.woff2,.eot"
                        : "*"
                    }
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium">{selectedFile.name}</span>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline ml-1"
                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div>
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Click to select a file</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {uploadForm.asset_type === "logo" || uploadForm.asset_type === "icon"
                          ? "PNG, JPG, SVG, GIF, WebP"
                          : uploadForm.asset_type === "font"
                          ? "TTF, OTF, WOFF, WOFF2, EOT"
                          : "Any file type"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={uploadForm.description}
                onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                placeholder="Brief description of this asset"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {assets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Palette className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No brand assets yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Upload your logo, brand colors, fonts, and guidelines
            </p>
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Your First Asset
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList>
            {CATEGORY_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeCategory} className="mt-6 space-y-8">
            {/* Logos Section */}
            {(activeCategory === "all" || activeCategory === "logos") && logoAssets.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Image className="h-5 w-5" />
                  Logos
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {logoAssets.map((asset) => {
                    const url = getFileUrl(asset);
                    return (
                      <Card key={asset.id} className="overflow-hidden">
                        {url && (
                          <div className="aspect-video bg-muted/50 flex items-center justify-center p-6">
                            <img
                              src={url}
                              alt={asset.name}
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                        )}
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">{asset.name}</p>
                              {asset.description && (
                                <p className="text-sm text-muted-foreground">{asset.description}</p>
                              )}
                              {asset.is_primary && (
                                <Badge variant="secondary" className="mt-2">Primary</Badge>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" onClick={() => handleDownload(asset)} title="Download">
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => handleDelete(asset.id, asset.file_path)} title="Delete" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Colors Section */}
            {(activeCategory === "all" || activeCategory === "colors") && colorAssets.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Brand Colors
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {colorAssets.map((asset) => {
                    const colorValue = asset.metadata?.hex || asset.metadata?.value || "#000000";
                    return (
                      <Card key={asset.id} className="overflow-hidden">
                        <div
                          className="h-24 w-full"
                          style={{ backgroundColor: colorValue }}
                        />
                        <CardContent className="p-3">
                          <p className="font-medium text-sm truncate">{asset.name}</p>
                          <div className="flex items-center justify-between mt-1">
                            <code className="text-xs text-muted-foreground">{colorValue}</code>
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => handleCopyColor(colorValue, asset.id)}
                                title="Copy color"
                              >
                                {copiedId === asset.id ? (
                                  <Check className="h-3 w-3 text-green-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(asset.id, asset.file_path)}
                                title="Delete"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Fonts Section */}
            {(activeCategory === "all" || activeCategory === "fonts") && fontAssets.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Type className="h-5 w-5" />
                  Typography
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {fontAssets.map((asset) => {
                    const url = getFileUrl(asset);
                    return (
                      <Card key={asset.id}>
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium">{asset.name}</p>
                              {asset.description && (
                                <p className="text-sm text-muted-foreground mt-1">{asset.description}</p>
                              )}
                              {asset.metadata?.weights && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {(asset.metadata.weights as string[]).map((weight) => (
                                    <Badge key={weight} variant="outline" className="text-xs">
                                      {weight}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {url && (
                                <Button size="sm" variant="outline" onClick={() => handleDownload(asset)}>
                                  <Download className="h-4 w-4 mr-2" />
                                  Download
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => handleDelete(asset.id, asset.file_path)} className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          {asset.metadata?.preview && (
                            <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                              <p className="text-2xl" style={{ fontFamily: asset.name }}>
                                {asset.metadata.preview}
                              </p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Guidelines Section */}
            {(activeCategory === "all" || activeCategory === "guidelines") && guidelineAssets.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Brand Guidelines
                </h3>
                <div className="space-y-3">
                  {guidelineAssets.map((asset) => {
                    const url = getFileUrl(asset);
                    return (
                      <Card key={asset.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                <FileText className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium">{asset.name}</p>
                                {asset.description && (
                                  <p className="text-sm text-muted-foreground">{asset.description}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {url && (
                                <>
                                  <Button size="sm" variant="outline" asChild>
                                    <a href={url} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="h-4 w-4 mr-2" />
                                      View
                                    </a>
                                  </Button>
                                  <Button size="sm" onClick={() => handleDownload(asset)}>
                                    <Download className="h-4 w-4 mr-2" />
                                    Download
                                  </Button>
                                </>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => handleDelete(asset.id, asset.file_path)} className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {filteredAssets.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No assets in this category</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}