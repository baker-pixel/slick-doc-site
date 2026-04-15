import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Download, Image, Type, Palette, FileText, Copy, Check, Upload, Plus, Trash2, ArrowLeft, FileUp } from "lucide-react";
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

const CATEGORY_TABS = [
  { value: "all", label: "All Assets" },
  { value: "logos", label: "Logos" },
  { value: "colors", label: "Colors" },
  { value: "fonts", label: "Fonts" },
  { value: "guidelines", label: "Guidelines" },
];

const FONT_EXTENSIONS = [".ttf", ".otf", ".woff", ".woff2", ".eot"];

function getFileExtension(name: string) {
  const ext = name.split(".").pop()?.toUpperCase() || "";
  return ext;
}

function isFontFile(name: string) {
  return FONT_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
}

function isImageFile(name: string) {
  return /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(name);
}

// Load a font via @font-face and return the family name
function loadFontFromUrl(url: string, familyName: string) {
  const id = `brand-font-${familyName.replace(/\s+/g, "-")}`;
  if (!document.getElementById(id)) {
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `@font-face { font-family: '${familyName}'; src: url('${url}'); }`;
    document.head.appendChild(style);
  }
}

interface ClientBrandAssetsTabProps {
  clientAccountId: string;
}

export default function ClientBrandAssetsTab({ clientAccountId }: ClientBrandAssetsTabProps) {
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadForm, setUploadForm] = useState({
    name: "",
    asset_type: "logo",
    description: "",
    colorValue: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; filePath: string | null; name: string } | null>(null);
  const [uploadStep, setUploadStep] = useState<1 | 2>(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAssets();
  }, [clientAccountId]);

  // Generate preview when file changes
  useEffect(() => {
    if (!selectedFile) {
      setFilePreview(null);
      return;
    }
    if (isImageFile(selectedFile.name)) {
      const url = URL.createObjectURL(selectedFile);
      setFilePreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setFilePreview(null);
  }, [selectedFile]);

  // Load fonts for font assets
  useEffect(() => {
    assets.filter((a) => a.asset_type === "font").forEach((asset) => {
      const url = getFileUrl(asset);
      if (url) loadFontFromUrl(url, `brand-${asset.id.slice(0, 8)}`);
    });
  }, [assets]);

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

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] || null);
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
    setUploadProgress(0);
    try {
      let filePath: string | null = null;

      if (selectedFile && uploadForm.asset_type !== "color") {
        const fileExt = selectedFile.name.split(".").pop();
        const fileName = `${clientAccountId}/${Date.now()}-${uploadForm.name.replace(/\s+/g, "-")}.${fileExt}`;

        // Simulate progress since Supabase JS SDK doesn't expose onUploadProgress
        const progressInterval = setInterval(() => {
          setUploadProgress((p) => Math.min(p + 15, 90));
        }, 200);

        const { error: uploadError } = await supabase.storage
          .from("brand-assets")
          .upload(fileName, selectedFile);

        clearInterval(progressInterval);
        setUploadProgress(100);

        if (uploadError) throw uploadError;
        filePath = fileName;
      }

      const metadata: Record<string, any> =
        uploadForm.asset_type === "color"
          ? { hex: uploadForm.colorValue, value: uploadForm.colorValue }
          : {};

      if (selectedFile && isFontFile(selectedFile.name)) {
        metadata.format = getFileExtension(selectedFile.name);
      }
      if (selectedFile && isImageFile(selectedFile.name)) {
        metadata.format = getFileExtension(selectedFile.name);
      }

      const { error: insertError } = await supabase.from("brand_assets").insert({
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

      toast({ title: "Asset uploaded successfully!" });
      setUploadDialogOpen(false);
      setUploadForm({ name: "", asset_type: "logo", description: "", colorValue: "" });
      setSelectedFile(null);
      setUploadProgress(0);
      fetchAssets();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.filePath) {
        await supabase.storage.from("brand-assets").remove([deleteTarget.filePath]);
      }
      const { error } = await supabase.from("brand_assets").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "Asset deleted" });
      fetchAssets();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast({ title: "Failed to delete asset", variant: "destructive" });
    } finally {
      setDeleteTarget(null);
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
      a.download = asset.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
      toast({ title: "Download started", description: asset.name });
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  const handleCopyColor = (colorValue: string, assetId: string) => {
    navigator.clipboard.writeText(colorValue);
    setCopiedId(assetId);
    toast({ title: "Color copied", description: colorValue });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openUploadWithType = (type: string) => {
    setUploadForm({ name: "", asset_type: type, description: "", colorValue: "" });
    setSelectedFile(null);
    setUploadStep(2);
    setUploadDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setUploadDialogOpen(open);
    if (!open) {
      setUploadStep(1);
      setSelectedFile(null);
      setUploadForm({ name: "", asset_type: "logo", description: "", colorValue: "" });
    }
  };

  const selectTypeAndAdvance = (type: string) => {
    setUploadForm({ name: "", asset_type: type, description: "", colorValue: "" });
    setSelectedFile(null);
    setUploadStep(2);
  };

  const goBackToStep1 = () => {
    setUploadStep(1);
    setSelectedFile(null);
    setUploadForm({ name: "", asset_type: "logo", description: "", colorValue: "" });
  };

  const TYPE_CARDS: { type: string; label: string; icon: typeof Image; description: string }[] = [
    { type: "logo", label: "Logo", icon: Image, description: "PNG, JPG, SVG, WebP" },
    { type: "color", label: "Color", icon: Palette, description: "Hex color values" },
    { type: "font", label: "Font", icon: Type, description: "TTF, OTF, WOFF, WOFF2" },
    { type: "guideline", label: "Guideline", icon: FileText, description: "PDF, DOC, DOCX" },
    { type: "other", label: "Other", icon: FileUp, description: "Any file type" },
  ];

  const DIALOG_TITLES: Record<string, string> = {
    logo: "Upload Logo",
    color: "Add Brand Color",
    font: "Upload Font",
    guideline: "Upload Guideline",
    icon: "Upload Icon",
    other: "Upload Asset",
  };

  const FILE_ACCEPT_MAP: Record<string, string> = {
    logo: ".png,.jpg,.jpeg,.svg,.webp",
    icon: ".png,.jpg,.jpeg,.svg,.webp",
    font: ".ttf,.otf,.woff,.woff2,.eot",
    guideline: ".pdf,.doc,.docx",
    other: "*",
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const logoAssets = assets.filter((a) => a.asset_type === "logo" || a.asset_type === "icon");
  const colorAssets = assets.filter((a) => a.asset_type === "color");
  const fontAssets = assets.filter((a) => a.asset_type === "font");
  const guidelineAssets = assets.filter((a) => a.asset_type === "guideline" || a.asset_type === "template" || a.asset_type === "other");

  const getFilteredAssets = () => {
    switch (activeCategory) {
      case "logos": return logoAssets;
      case "colors": return colorAssets;
      case "fonts": return fontAssets;
      case "guidelines": return guidelineAssets;
      default: return assets;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const fileAccept =
    uploadForm.asset_type === "logo" || uploadForm.asset_type === "icon"
      ? "image/*"
      : uploadForm.asset_type === "font"
      ? ".ttf,.otf,.woff,.woff2,.eot"
      : "*";

  // ---- Action buttons shared pattern ----
  const AssetActions = ({ asset }: { asset: BrandAsset }) => (
    <div className="flex gap-1">
      {getFileUrl(asset) && (
        <Button size="icon" variant="ghost" onClick={() => handleDownload(asset)} title="Download" className="h-8 w-8">
          <Download className="h-4 w-4" />
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setDeleteTarget({ id: asset.id, filePath: asset.file_path, name: asset.name })}
        title="Delete"
        className="h-8 w-8 text-destructive hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  // ---- Per-category empty state ----
  const CategoryEmptyState = ({ category }: { category: string }) => {
    const config: Record<string, { icon: typeof Image; label: string; type: string }> = {
      logos: { icon: Image, label: "Logo", type: "logo" },
      colors: { icon: Palette, label: "Color", type: "color" },
      fonts: { icon: Type, label: "Font", type: "font" },
      guidelines: { icon: FileText, label: "Guideline", type: "guideline" },
    };
    const c = config[category];
    if (!c) return null;
    const Icon = c.icon;
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Icon className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No {c.label.toLowerCase()}s yet</h3>
          <p className="text-muted-foreground text-center mb-4">
            Upload your brand {c.label.toLowerCase()}s to keep them organized
          </p>
          <Button onClick={() => openUploadWithType(c.type)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload {c.label}
          </Button>
        </CardContent>
      </Card>
    );
  };

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
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
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
                onValueChange={(value) => {
                  setUploadForm({ ...uploadForm, asset_type: value });
                  setSelectedFile(null);
                }}
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
                    type="color"
                    value={uploadForm.colorValue || "#000000"}
                    onChange={(e) => setUploadForm({ ...uploadForm, colorValue: e.target.value })}
                    className="w-14 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    id="color-value"
                    value={uploadForm.colorValue}
                    onChange={(e) => setUploadForm({ ...uploadForm, colorValue: e.target.value })}
                    placeholder="#FF5500"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>File *</Label>
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-primary/50"
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={fileAccept}
                    onChange={handleFileSelect}
                  />
                  {selectedFile ? (
                    <div className="space-y-3">
                      {/* Image thumbnail preview */}
                      {filePreview && isImageFile(selectedFile.name) && (
                        <div className="flex justify-center">
                          <img
                            src={filePreview}
                            alt="Preview"
                            className="max-h-32 max-w-full object-contain rounded border"
                          />
                        </div>
                      )}
                      {/* Font file info */}
                      {isFontFile(selectedFile.name) && (
                        <div className="flex items-center justify-center gap-2">
                          <Type className="h-8 w-8 text-primary" />
                          <div className="text-left">
                            <p className="text-sm font-medium">{selectedFile.name}</p>
                            <Badge variant="outline" className="text-xs mt-1">
                              {getFileExtension(selectedFile.name)}
                            </Badge>
                          </div>
                        </div>
                      )}
                      {/* Generic file info */}
                      {!isImageFile(selectedFile.name) && !isFontFile(selectedFile.name) && (
                        <div className="flex items-center justify-center gap-2">
                          <FileText className="h-5 w-5 text-primary" />
                          <span className="text-sm font-medium">{selectedFile.name}</span>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">Click or drag to replace</p>
                    </div>
                  ) : (
                    <div>
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm font-medium">Drag & drop a file here</p>
                      <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Upload progress */}
            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Uploading…</span>
                  <span className="font-medium">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
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
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this brand asset. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            {/* LOGOS */}
            {(activeCategory === "all" || activeCategory === "logos") && (
              logoAssets.length > 0 ? (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Image className="h-5 w-5" /> Logos
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {logoAssets.map((asset) => {
                      const url = getFileUrl(asset);
                      const format = asset.metadata?.format || (asset.file_path ? getFileExtension(asset.file_path) : null);
                      return (
                        <Card key={asset.id} className="overflow-hidden group">
                          <div className="aspect-video bg-muted/50 flex items-center justify-center p-6 relative">
                            {url ? (
                              <img src={url} alt={asset.name} className="max-h-full max-w-full object-contain" />
                            ) : (
                              <Image className="h-8 w-8 text-muted-foreground" />
                            )}
                            {format && (
                              <Badge
                                variant="secondary"
                                className="absolute top-2 right-2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                {format}
                              </Badge>
                            )}
                          </div>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium truncate">{asset.name}</p>
                                {asset.description && (
                                  <p className="text-sm text-muted-foreground truncate">{asset.description}</p>
                                )}
                                {asset.is_primary && <Badge variant="secondary" className="mt-2">Primary</Badge>}
                              </div>
                              <AssetActions asset={asset} />
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ) : activeCategory === "logos" ? (
                <CategoryEmptyState category="logos" />
              ) : null
            )}

            {/* COLORS */}
            {(activeCategory === "all" || activeCategory === "colors") && (
              colorAssets.length > 0 ? (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Palette className="h-5 w-5" /> Brand Colors
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    {colorAssets.map((asset) => {
                      const colorValue = asset.metadata?.hex || asset.metadata?.value || "#000000";
                      return (
                        <Card key={asset.id} className="overflow-hidden">
                          <div
                            className="h-24 w-full cursor-pointer transition-opacity hover:opacity-90"
                            style={{ backgroundColor: colorValue }}
                            onClick={() => handleCopyColor(colorValue, asset.id)}
                            title="Click to copy hex"
                          />
                          <CardContent className="p-3">
                            <p className="font-medium text-sm truncate">{asset.name}</p>
                            <div className="flex items-center justify-between mt-1">
                              <code className="text-xs text-muted-foreground">{colorValue}</code>
                              <div className="flex gap-1">
                                <Button
                                  size="icon" variant="ghost" className="h-6 w-6"
                                  onClick={() => handleCopyColor(colorValue, asset.id)}
                                  title="Copy color"
                                >
                                  {copiedId === asset.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                </Button>
                                <Button
                                  size="icon" variant="ghost"
                                  className="h-6 w-6 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteTarget({ id: asset.id, filePath: asset.file_path, name: asset.name })}
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
              ) : activeCategory === "colors" ? (
                <CategoryEmptyState category="colors" />
              ) : null
            )}

            {/* FONTS */}
            {(activeCategory === "all" || activeCategory === "fonts") && (
              fontAssets.length > 0 ? (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Type className="h-5 w-5" /> Typography
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {fontAssets.map((asset) => {
                      const url = getFileUrl(asset);
                      const fontFamily = `brand-${asset.id.slice(0, 8)}`;
                      const format = asset.metadata?.format || (asset.file_path ? getFileExtension(asset.file_path) : null);
                      return (
                        <Card key={asset.id} className="overflow-hidden">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium truncate">{asset.name}</p>
                                  {format && <Badge variant="outline" className="text-[10px] shrink-0">{format}</Badge>}
                                </div>
                                {asset.description && (
                                  <p className="text-sm text-muted-foreground mt-1">{asset.description}</p>
                                )}
                              </div>
                              <AssetActions asset={asset} />
                            </div>
                            {url && (
                              <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                                <p className="text-xl leading-relaxed" style={{ fontFamily }}>
                                  The quick brown fox jumps over the lazy dog
                                </p>
                                <p className="text-sm mt-2" style={{ fontFamily }}>
                                  ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789
                                </p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ) : activeCategory === "fonts" ? (
                <CategoryEmptyState category="fonts" />
              ) : null
            )}

            {/* GUIDELINES */}
            {(activeCategory === "all" || activeCategory === "guidelines") && (
              guidelineAssets.length > 0 ? (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <FileText className="h-5 w-5" /> Brand Guidelines
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {guidelineAssets.map((asset) => (
                      <Card key={asset.id} className="overflow-hidden">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <FileText className="h-5 w-5 text-primary" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium truncate">{asset.name}</p>
                                {asset.description && (
                                  <p className="text-sm text-muted-foreground truncate">{asset.description}</p>
                                )}
                              </div>
                            </div>
                            <AssetActions asset={asset} />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : activeCategory === "guidelines" ? (
                <CategoryEmptyState category="guidelines" />
              ) : null
            )}

            {/* "All" tab shows empty state only if truly empty */}
            {activeCategory === "all" && assets.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No assets uploaded yet</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
