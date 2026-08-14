import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Loader2, Download, Image, Type, Palette, FileText, Copy, Check,
  Upload, Plus, Trash2, CheckCircle2, X, Info, MessageSquare, BookOpen, Volume2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { completeWorkflowStep } from "@/lib/completeWorkflowStep";

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
  confirmed: boolean;
  created_at: string;
  signedUrl?: string;
}

interface ClientBrandAssetsTabProps {
  clientAccountId: string;
  onTabChange?: (tab: string) => void;
}

function brandKitCompleteness(assets: BrandAsset[]): { score: number; breakdown: Record<string, boolean> } {
  const confirmed = assets.filter((a) => a.confirmed);
  const hasLogo = confirmed.some((a) => a.asset_type === "logo" || a.asset_type === "icon" || a.asset_type === "og_image");
  const hasColors = confirmed.filter((a) => a.asset_type === "color").length >= 3;
  const hasFont = confirmed.some((a) => a.asset_type === "font");
  const hasVoice = confirmed.some((a) => a.asset_type === "brand_voice");
  const hasValueProp = confirmed.some(
    (a) => a.asset_type === "brand_voice" && a.metadata?.sub_type === "value_proposition"
  );

  const breakdown = { hasLogo, hasColors, hasFont, hasVoice, hasValueProp };
  const score =
    (hasLogo ? 20 : 0) +
    (hasColors ? 20 : 0) +
    (hasFont ? 15 : 0) +
    (hasVoice ? 30 : 0) +
    (hasValueProp ? 15 : 0);

  return { score, breakdown };
}

export default function ClientBrandAssetsTab({ clientAccountId, onTabChange }: ClientBrandAssetsTabProps) {
  const queryClient = useQueryClient();
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [generatingGuidelines, setGeneratingGuidelines] = useState(false);

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

      const rows = (data || []) as unknown as BrandAsset[];

      // Generate signed URLs for file assets
      const withUrls = await Promise.all(
        rows.map(async (asset) => {
          if (!asset.file_path) return asset;
          try {
            const { data: urlData } = await supabase.storage
              .from("brand-assets")
              .createSignedUrl(asset.file_path, 3600);
            return { ...asset, signedUrl: urlData?.signedUrl };
          } catch {
            return asset;
          }
        })
      );

      setAssets(withUrls);
    } catch (error) {
      console.error("Error fetching brand assets:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAsset = async (assetId: string) => {
    setConfirmingId(assetId);
    try {
      const asset = assets.find((a) => a.id === assetId);
      const { error } = await supabase
        .from("brand_assets")
        .update({
          confirmed: true,
          metadata: {
            ...asset?.metadata,
            confirmation_status: "confirmed",
            confirmed_at: new Date().toISOString(),
          },
        })
        .eq("id", assetId);
      if (error) throw error;

      try {
        // The onboarding step requires a logo, not just any confirmed asset
        // (payload.required = ["logo_primary"]) -- only complete it once a
        // logo/icon is actually confirmed, whether that's the one just
        // confirmed or one confirmed earlier.
        const isLogo = asset?.asset_type === "logo" || asset?.asset_type === "icon";
        const hasConfirmedLogo =
          isLogo || assets.some((a) => a.id !== assetId && a.confirmed && (a.asset_type === "logo" || a.asset_type === "icon"));

        if (hasConfirmedLogo) {
          const completed = await completeWorkflowStep(clientAccountId, "client_upload");
          if (completed) {
            queryClient.invalidateQueries({ queryKey: ["client-workflow", clientAccountId] });
            queryClient.invalidateQueries({ queryKey: ["onboarding-complete", clientAccountId] });
            // Onboarding step done -- take them straight to the next one
            // (Connect Social Accounts) instead of leaving them here.
            onTabChange?.("social");
          }
        }
      } catch (e) {
        console.error("Workflow step update after asset confirm failed:", e);
      }

      toast({ title: "Confirmed", description: "We'll use this in your marketing materials." });
      fetchAssets();
    } catch (err: any) {
      toast({ title: "Could not confirm", description: err.message, variant: "destructive" });
    } finally {
      setConfirmingId(null);
    }
  };

  const handleRejectAsset = async (asset: BrandAsset) => {
    setRejectingId(asset.id);
    try {
      if (asset.file_path) {
        await supabase.storage.from("brand-assets").remove([asset.file_path]);
      }
      const { error } = await supabase.from("brand_assets").delete().eq("id", asset.id);
      if (error) throw error;
      toast({ title: "Removed", description: "Got it — we won't use that asset." });
      fetchAssets();
    } catch (err: any) {
      toast({ title: "Could not remove", description: err.message, variant: "destructive" });
    } finally {
      setRejectingId(null);
    }
  };

  const getFileUrl = (asset: BrandAsset) => {
    return asset.signedUrl || asset.file_url || null;
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
      if (selectedFile && uploadForm.asset_type !== "color") {
        const fileExt = selectedFile.name.split(".").pop();
        const fileName = `${clientAccountId}/${Date.now()}-${uploadForm.name.replace(/\s+/g, "-")}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("brand-assets").upload(fileName, selectedFile);
        if (uploadError) throw uploadError;
        filePath = fileName;
      }

      const metadata =
        uploadForm.asset_type === "color"
          ? { hex: uploadForm.colorValue, value: uploadForm.colorValue }
          : {};

      const { error: insertError } = await supabase.from("brand_assets").insert({
        client_account_id: clientAccountId,
        name: uploadForm.name,
        description: uploadForm.description || null,
        asset_type: uploadForm.asset_type,
        category:
          uploadForm.asset_type === "logo" || uploadForm.asset_type === "icon" ? "logos" :
          uploadForm.asset_type === "color" ? "colors" :
          uploadForm.asset_type === "font" ? "fonts" : "guidelines",
        file_path: filePath,
        metadata,
      });
      if (insertError) throw insertError;

      // Note: uploading doesn't complete the "Verify Brand Assets" onboarding
      // step by itself -- the asset lands unconfirmed (same as a website-
      // detected asset) and the step only completes once a logo/icon is
      // actually confirmed, in handleConfirmAsset.

      toast({ title: "Asset uploaded successfully!" });
      setUploadDialogOpen(false);
      resetUploadForm();
      fetchAssets();
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (assetId: string, filePath: string | null) => {
    if (!confirm("Delete this asset?")) return;
    try {
      if (filePath) await supabase.storage.from("brand-assets").remove([filePath]);
      const { error } = await supabase.from("brand_assets").delete().eq("id", assetId);
      if (error) throw error;
      toast({ title: "Asset deleted" });
      fetchAssets();
    } catch (error: any) {
      toast({ title: "Failed to delete asset", variant: "destructive" });
    }
  };

  const handleDownload = async (asset: BrandAsset) => {
    const url = getFileUrl(asset);
    if (!url) { toast({ title: "No file available", variant: "destructive" }); return; }
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      const ext = asset.file_path ? "." + asset.file_path.split(".").pop() : "";
      a.download = asset.name + ext;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
      toast({ title: "Download started" });
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  const handleGenerateGuidelines = async () => {
    setGeneratingGuidelines(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-brand-guidelines", {
        body: { client_id: clientAccountId },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Generation failed");
      }
      toast({
        title: "Brand guidelines generated!",
        description: "Available in your deliverables.",
      });
    } catch (err: any) {
      toast({ title: "Could not generate guidelines", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingGuidelines(false);
    }
  };

  const resetUploadForm = () => {
    setUploadForm({ name: "", asset_type: "logo", description: "", colorValue: "" });
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCopyColor = (colorValue: string, assetId: string) => {
    navigator.clipboard.writeText(colorValue);
    setCopiedId(assetId);
    toast({ title: "Copied", description: colorValue });
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const confirmedAssets = assets.filter((a) => a.confirmed);
  const pendingAssets = assets.filter((a) => !a.confirmed);

  const logos = confirmedAssets.filter((a) => a.asset_type === "logo" || a.asset_type === "icon" || a.asset_type === "og_image");
  const colorAssets = confirmedAssets.filter((a) => a.asset_type === "color");
  const fontAssets = confirmedAssets.filter((a) => a.asset_type === "font");
  const voiceAssets = confirmedAssets.filter((a) => a.asset_type === "brand_voice");
  const legacyVoiceAssets = confirmedAssets.filter((a) => ["headline", "description"].includes(a.asset_type));
  const otherAssets = confirmedAssets.filter(
    (a) => !["logo", "og_image", "icon", "color", "font", "brand_voice", "headline", "description"].includes(a.asset_type)
  );
  const langAsset = confirmedAssets.find((a) => a.asset_type === "language");

  const { score: completeness } = brandKitCompleteness(assets);
  const canGenerateGuidelines = completeness >= 70;

  const renderVoiceValue = (asset: BrandAsset) => {
    const v = asset.metadata?.value;
    if (Array.isArray(v)) return (v as string[]).join(", ");
    return typeof v === "string" ? v : asset.name;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Brand Assets</h2>
          <p className="text-muted-foreground text-sm">Your brand identity in one place</p>
        </div>
        <Button onClick={() => setUploadDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Upload Asset
        </Button>
      </div>

      {/* Brand Kit Completeness */}
      {assets.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Brand Kit Completeness</p>
              <span className="text-sm font-semibold text-primary">{completeness}%</span>
            </div>
            <Progress value={completeness} className="h-2 mb-3" />
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Logo", done: confirmedAssets.some((a) => a.asset_type === "logo" || a.asset_type === "icon" || a.asset_type === "og_image") },
                { label: "3+ Colors", done: confirmedAssets.filter((a) => a.asset_type === "color").length >= 3 },
                { label: "Font", done: confirmedAssets.some((a) => a.asset_type === "font") },
                { label: "Brand Voice", done: confirmedAssets.some((a) => a.asset_type === "brand_voice") },
                { label: "Value Proposition", done: confirmedAssets.some((a) => a.asset_type === "brand_voice" && a.metadata?.sub_type === "value_proposition") },
              ].map(({ label, done }) => (
                <span
                  key={label}
                  className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${
                    done
                      ? "border-green-400 bg-green-50 text-green-700"
                      : "border-muted-foreground/30 text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="h-3 w-3" /> : <span className="h-3 w-3 inline-block" />}
                  {label}
                </span>
              ))}
            </div>
            {canGenerateGuidelines && (
              <div className="mt-3 pt-3 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateGuidelines}
                  disabled={generatingGuidelines}
                >
                  {generatingGuidelines ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <BookOpen className="h-4 w-4 mr-2" />
                  )}
                  Generate Brand Guidelines
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pending confirmation */}
      {pendingAssets.length > 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Info className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">
                We detected {pendingAssets.length} brand asset{pendingAssets.length !== 1 ? "s" : ""} from your website
              </p>
              <p className="text-xs text-muted-foreground">
                Confirm these are yours so we can use them in your marketing.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {pendingAssets.map((asset) => {
              const url = getFileUrl(asset);
              const colorVal = asset.metadata?.hex || asset.metadata?.value;
              const isWorking = confirmingId === asset.id || rejectingId === asset.id;
              const isBrandVoice = asset.asset_type === "brand_voice";

              return (
                <div
                  key={asset.id}
                  className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5"
                >
                  {/* Preview */}
                  {asset.asset_type === "color" && colorVal ? (
                    <div className="h-9 w-9 rounded-md border flex-shrink-0" style={{ backgroundColor: colorVal }} />
                  ) : asset.asset_type === "font" ? (
                    <div className="h-9 w-9 rounded-md bg-background border flex-shrink-0 flex items-center justify-center">
                      <Type className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ) : isBrandVoice ? (
                    <div className="h-9 w-9 rounded-md bg-background border flex-shrink-0 flex items-center justify-center">
                      <Volume2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ) : ["headline", "description"].includes(asset.asset_type) ? (
                    <div className="h-9 w-9 rounded-md bg-background border flex-shrink-0 flex items-center justify-center">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ) : url ? (
                    <div className="h-9 w-9 rounded-md bg-background border flex-shrink-0 overflow-hidden flex items-center justify-center">
                      <img
                        src={url}
                        alt={asset.name}
                        className="max-h-full max-w-full object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  ) : (
                    <div className="h-9 w-9 rounded-md bg-background border flex-shrink-0 flex items-center justify-center">
                      <Image className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{asset.name}</p>
                    {isBrandVoice && asset.metadata?.value && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{renderVoiceValue(asset)}</p>
                    )}
                    {["headline", "description"].includes(asset.asset_type) && asset.metadata?.value && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{asset.metadata.value}</p>
                    )}
                    {asset.asset_type === "font" && (
                      <p className="text-xs text-muted-foreground font-mono">{asset.metadata?.value || asset.name}</p>
                    )}
                    <Badge variant="outline" className="text-xs capitalize mt-0.5">
                      {isBrandVoice ? (asset.metadata?.sub_type?.replace(/_/g, " ") || "brand voice") : asset.asset_type}
                    </Badge>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 text-xs gap-1.5"
                      disabled={isWorking}
                      onClick={() => handleConfirmAsset(asset.id)}
                    >
                      {confirmingId === asset.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      disabled={isWorking}
                      onClick={() => handleRejectAsset(asset)}
                      title="Remove"
                    >
                      {rejectingId === asset.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {assets.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <Palette className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="font-medium mb-1">No brand assets yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Upload your logo, brand colors, fonts, and guidelines.
              </p>
            </div>
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Your First Asset
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Confirmed assets grid */}
      {confirmedAssets.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Logo & Icons */}
          {logos.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Image className="h-4 w-4 text-primary" />
                  Logo & Icons
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {logos.map((asset) => {
                    const url = getFileUrl(asset);
                    return (
                      <div key={asset.id} className="rounded-lg border bg-muted/30 overflow-hidden group">
                        <div className="h-20 flex items-center justify-center p-3 bg-background">
                          {url ? (
                            <img src={url} alt={asset.name} className="max-h-full max-w-full object-contain" />
                          ) : (
                            <Image className="h-8 w-8 text-muted-foreground" />
                          )}
                        </div>
                        <div className="px-2.5 py-2 flex items-center justify-between gap-1">
                          <p className="text-xs font-medium truncate flex-1">{asset.name}</p>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                            {url && (
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDownload(asset)} aria-label={`Download ${asset.name}`}>
                                <Download className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Brand Colors */}
          {colorAssets.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Palette className="h-4 w-4 text-primary" />
                  Brand Colors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {colorAssets.map((asset) => {
                    const colorValue = asset.metadata?.hex || asset.metadata?.value || "#000000";
                    return (
                      <div key={asset.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 p-2.5 group">
                        <div className="h-10 w-10 rounded-md border flex-shrink-0" style={{ backgroundColor: colorValue }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{asset.name}</p>
                          <code className="text-xs text-muted-foreground">{colorValue.toUpperCase()}</code>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleCopyColor(colorValue, asset.id)}
                            title="Copy hex"
                            aria-label={`Copy hex code for ${asset.name}`}
                          >
                            {copiedId === asset.id ? (
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Typography */}
          {fontAssets.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Type className="h-4 w-4 text-primary" />
                  Typography
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {fontAssets.map((asset) => {
                    const fontFamily = asset.metadata?.value || asset.name;
                    return (
                      <div key={asset.id} className="rounded-lg border bg-muted/30 p-4">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{asset.name}</p>
                        <p className="text-2xl leading-tight" style={{ fontFamily: `"${fontFamily}", sans-serif` }}>
                          Aa Bb Cc
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 font-mono">{fontFamily}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Brand Voice (AI-extracted) */}
          {voiceAssets.length > 0 && (
            <Card className={voiceAssets.length > 2 ? "lg:col-span-2" : ""}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-primary" />
                  Brand Voice
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={voiceAssets.length > 2 ? "grid grid-cols-1 md:grid-cols-2 gap-3" : "space-y-3"}>
                  {voiceAssets.map((asset) => (
                    <div key={asset.id} className="rounded-lg border bg-muted/30 p-3">
                      <Badge variant="outline" className="text-xs capitalize mb-2">
                        {asset.metadata?.sub_type?.replace(/_/g, " ") || "brand voice"}
                      </Badge>
                      <p className="text-sm leading-relaxed">{renderVoiceValue(asset)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Legacy voice assets (headline, description) */}
          {legacyVoiceAssets.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  Brand Copy
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {legacyVoiceAssets.map((asset) => (
                    <div key={asset.id} className="rounded-lg border bg-muted/30 p-3">
                      <Badge variant="outline" className="text-xs capitalize mb-2">{asset.asset_type}</Badge>
                      <p className="text-sm leading-relaxed">{asset.metadata?.value || asset.name}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Language */}
          {langAsset && (
            <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-0.5">Website Language</p>
                <p className="font-medium text-sm">{langAsset.name}</p>
              </div>
              <Badge variant="secondary" className="font-mono">{langAsset.metadata?.value || langAsset.name}</Badge>
            </div>
          )}

          {/* Guidelines / Other */}
          {otherAssets.length > 0 && (
            <Card className={langAsset ? "" : "lg:col-span-2"}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Brand Guidelines
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {otherAssets.map((asset) => {
                    const url = getFileUrl(asset);
                    return (
                      <div key={asset.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 group">
                        <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{asset.name}</p>
                          {asset.description && <p className="text-xs text-muted-foreground truncate">{asset.description}</p>}
                        </div>
                        {url && (
                          <Button size="sm" variant="outline" className="h-7 text-xs px-2 opacity-0 group-hover:opacity-100" onClick={() => handleDownload(asset)}>
                            <Download className="h-3 w-3 mr-1" />
                            Download
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={(o) => { if (!o) resetUploadForm(); setUploadDialogOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Brand Asset</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="asset-name">Name *</Label>
              <Input
                id="asset-name"
                value={uploadForm.name}
                onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                placeholder="e.g., Primary Logo, Brand Blue"
              />
            </div>
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select
                value={uploadForm.asset_type}
                onValueChange={(v) => setUploadForm({ ...uploadForm, asset_type: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Label>Color *</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={uploadForm.colorValue || "#000000"}
                    onChange={(e) => setUploadForm({ ...uploadForm, colorValue: e.target.value })}
                    className="w-14 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    value={uploadForm.colorValue}
                    onChange={(e) => setUploadForm({ ...uploadForm, colorValue: e.target.value })}
                    placeholder="#FF5500"
                    className="flex-1"
                  />
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
                    <>
                      <Upload className="h-7 w-7 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Click to select a file</p>
                    </>
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
            <Button variant="outline" onClick={() => { resetUploadForm(); setUploadDialogOpen(false); }}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
