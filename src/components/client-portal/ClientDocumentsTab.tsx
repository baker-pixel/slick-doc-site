import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Download, FolderOpen, File, FileImage, FileSpreadsheet, FileArchive } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Document {
  id: string;
  name: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
  category: string;
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
}

interface ClientDocumentsTabProps {
  clientAccountId: string;
}

const categoryLabels: Record<string, string> = {
  general: "General",
  contract: "Contracts",
  proposal: "Proposals",
  brand: "Brand Assets",
  deliverable: "Deliverables",
  report: "Reports",
};

const categoryColors: Record<string, string> = {
  general: "bg-secondary",
  contract: "bg-blue-500/10 text-blue-600",
  proposal: "bg-purple-500/10 text-purple-600",
  brand: "bg-orange-500/10 text-orange-600",
  deliverable: "bg-green-500/10 text-green-600",
  report: "bg-cyan-500/10 text-cyan-600",
};

export default function ClientDocumentsTab({ clientAccountId }: ClientDocumentsTabProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    fetchDocuments();

    const channel = supabase
      .channel('client-documents-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_documents',
          filter: `client_account_id=eq.${clientAccountId}`,
        },
        () => {
          console.log('Documents updated, refreshing...');
          fetchDocuments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientAccountId]);

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from("client_documents")
        .select("*")
        .eq("client_account_id", clientAccountId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast({
        title: "Error",
        description: "Failed to load documents",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (doc: Document) => {
    setDownloading(doc.id);
    try {
      const { data, error } = await supabase.storage
        .from("client-documents")
        .download(doc.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download started",
        description: `${doc.name} is downloading`,
      });
    } catch (error) {
      console.error("Error downloading file:", error);
      toast({
        title: "Download failed",
        description: "Unable to download file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloading(null);
    }
  };

  const getFileIcon = (fileType: string | null) => {
    if (!fileType) return <File className="h-8 w-8" />;
    
    if (fileType.includes("image")) return <FileImage className="h-8 w-8 text-pink-500" />;
    if (fileType.includes("spreadsheet") || fileType.includes("excel") || fileType.includes("csv")) 
      return <FileSpreadsheet className="h-8 w-8 text-green-500" />;
    if (fileType.includes("zip") || fileType.includes("archive") || fileType.includes("compressed"))
      return <FileArchive className="h-8 w-8 text-yellow-500" />;
    if (fileType.includes("pdf")) return <FileText className="h-8 w-8 text-red-500" />;
    
    return <FileText className="h-8 w-8 text-blue-500" />;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const categories = [...new Set(documents.map(d => d.category))];
  const filteredDocuments = selectedCategory 
    ? documents.filter(d => d.category === selectedCategory)
    : documents;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No Documents Yet</h3>
          <p className="text-sm text-muted-foreground text-center">
            Documents shared by your agency team will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{documents.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{categories.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Latest Upload</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {format(new Date(documents[0].created_at), "MMM d")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Category Filter */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedCategory === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(null)}
          >
            All
          </Button>
          {categories.map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(category)}
            >
              {categoryLabels[category] || category}
            </Button>
          ))}
        </div>
      )}

      {/* Documents List */}
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>
            Files shared with you by your agency team
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  {getFileIcon(doc.file_type)}
                  <div>
                    <h4 className="font-medium text-foreground">{doc.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge 
                        variant="secondary" 
                        className={categoryColors[doc.category] || ""}
                      >
                        {categoryLabels[doc.category] || doc.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(doc.file_size)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(doc.created_at), "MMM d, yyyy")}
                      </span>
                    </div>
                    {doc.description && (
                      <p className="text-sm text-muted-foreground mt-1">{doc.description}</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(doc)}
                  disabled={downloading === doc.id}
                >
                  {downloading === doc.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
