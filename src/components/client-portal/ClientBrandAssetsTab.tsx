import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Download, Image, Type, Palette, FileText, Copy, Check, ExternalLink } from "lucide-react";
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
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
    } catch (error) {
      console.error("Download error:", error);
      toast({ title: "Download failed", variant: "destructive" });
    }
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

  const logoAssets = assets.filter((a) => a.asset_type === "logo");
  const colorAssets = assets.filter((a) => a.asset_type === "color");
  const fontAssets = assets.filter((a) => a.asset_type === "font");
  const guidelineAssets = assets.filter((a) => a.asset_type === "guideline" || a.asset_type === "template");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Brand Assets</h2>
        <p className="text-muted-foreground">Access your brand logos, colors, fonts, and guidelines</p>
      </div>

      {assets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Palette className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No brand assets yet</h3>
            <p className="text-muted-foreground text-center">
              Your brand assets will appear here once they're uploaded
            </p>
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
                            <Button size="icon" variant="ghost" onClick={() => handleDownload(asset)}>
                              <Download className="h-4 w-4" />
                            </Button>
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
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => handleCopyColor(colorValue, asset.id)}
                            >
                              {copiedId === asset.id ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
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
                            {url && (
                              <Button size="sm" variant="outline" onClick={() => handleDownload(asset)}>
                                <Download className="h-4 w-4 mr-2" />
                                Download
                              </Button>
                            )}
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