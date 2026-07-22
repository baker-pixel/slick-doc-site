import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { Plus, Upload, Brain, FileText, Loader2, Trash2 } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { callAdminApi } from "@/lib/admin-api";

interface SOPDocument {
  id: string;
  tier: string;
  category: string;
  name: string;
  description: string | null;
  file_url: string | null;
  parsed_content: Record<string, unknown> | null;
  action_items: unknown[] | null;
  is_active: boolean;
  created_at: string;
}

export function SOPManagementPanel() {
  const { adminPassword } = useAdminAuth();
  const [sops, setSOPs] = useState<SOPDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [parsingIds, setParsingIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [newSOP, setNewSOP] = useState({
    tier: "foundation",
    category: "general",
    name: "",
    description: "",
  });

  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    fetchSOPs();
  }, []);

  const fetchSOPs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sop_documents")
      .select("*")
      .order("tier", { ascending: true })
      .order("category", { ascending: true });

    if (error) {
      toast.error("Failed to fetch SOPs");
      console.error(error);
    } else {
      setSOPs((data || []) as SOPDocument[]);
    }
    setLoading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const addSOP = async () => {
    if (!newSOP.name) {
      toast.error("SOP name is required");
      return;
    }

    setUploadingFile(true);
    let fileUrl: string | null = null;

    try {
      // Upload file if selected
      if (selectedFile) {
        const fileExt = selectedFile.name.split(".").pop();
        const fileName = `${Date.now()}-${newSOP.name.replace(/\s+/g, "-")}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("sop-documents")
          .upload(fileName, selectedFile);

        if (uploadError) throw uploadError;
        
        const { data: urlData } = supabase.storage
          .from("sop-documents")
          .getPublicUrl(uploadData.path);
        
        fileUrl = urlData.publicUrl;
      }

      // Insert SOP record
      const { error } = await callAdminApi(adminPassword, {
        action: "create",
        table: "sop_documents",
        data: {
          tier: newSOP.tier,
          category: newSOP.category,
          name: newSOP.name,
          description: newSOP.description || null,
          file_url: fileUrl,
          is_active: true,
        },
      });

      if (error) throw new Error(error);

      toast.success("SOP added successfully");
      setAddDialogOpen(false);
      setNewSOP({ tier: "foundation", category: "general", name: "", description: "" });
      setSelectedFile(null);
      fetchSOPs();
    } catch (err) {
      toast.error("Failed to add SOP: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setUploadingFile(false);
    }
  };

  const parseSOP = async (sop: SOPDocument) => {
    setParsingIds((prev) => new Set([...prev, sop.id]));

    try {
      const { data, error } = await supabase.functions.invoke("parse-sop", {
        body: { sopId: sop.id, documentText: sop.description, password: adminPassword },
      });

      if (error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to parse SOP");
      }

      toast.success("SOP parsed successfully");
      fetchSOPs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setParsingIds((prev) => {
        const next = new Set(prev);
        next.delete(sop.id);
        return next;
      });
    }
  };

  const deleteSOP = async (id: string) => {
    if (!confirm("Are you sure you want to delete this SOP?")) return;

    const { error } = await callAdminApi(adminPassword, { action: "delete", table: "sop_documents", id });

    if (error) {
      toast.error("Failed to delete SOP");
    } else {
      toast.success("SOP deleted");
      fetchSOPs();
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "email_sequences": return "bg-blue-500";
      case "content_generation": return "bg-purple-500";
      case "reporting": return "bg-green-500";
      default: return "bg-gray-500";
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "foundation": return "bg-slate-500";
      case "growth": return "bg-blue-500";
      case "transformation": return "bg-purple-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          SOP Documents
        </CardTitle>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add SOP
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New SOP</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={newSOP.name}
                  onChange={(e) => setNewSOP({ ...newSOP, name: e.target.value })}
                  placeholder="e.g., Weekly Email Nurture Sequence"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tier</Label>
                  <Select value={newSOP.tier} onValueChange={(v) => setNewSOP({ ...newSOP, tier: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="foundation">Foundation</SelectItem>
                      <SelectItem value="growth">Growth</SelectItem>
                      <SelectItem value="transformation">Transformation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={newSOP.category} onValueChange={(v) => setNewSOP({ ...newSOP, category: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email_sequences">Email Sequences</SelectItem>
                      <SelectItem value="content_generation">Content Generation</SelectItem>
                      <SelectItem value="reporting">Reporting</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description / Content</Label>
                <Textarea
                  value={newSOP.description}
                  onChange={(e) => setNewSOP({ ...newSOP, description: e.target.value })}
                  placeholder="Paste your SOP content here or describe the process..."
                  rows={6}
                />
              </div>
              <div className="space-y-2">
                <Label>Upload Document (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleFileSelect}
                    className="flex-1"
                  />
                </div>
                {selectedFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {selectedFile.name}
                  </p>
                )}
              </div>
              <Button onClick={addSOP} disabled={uploadingFile} className="w-full">
                {uploadingFile ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Add SOP
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : sops.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No SOPs yet. Add your first SOP to enable AI automation.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Parsed</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sops.map((sop) => (
                <TableRow key={sop.id}>
                  <TableCell>
                    <div className="font-medium">{sop.name}</div>
                    {sop.description && (
                      <div className="text-xs text-muted-foreground truncate max-w-xs">
                        {sop.description.substring(0, 80)}...
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={getTierColor(sop.tier)}>{sop.tier}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getCategoryColor(sop.category)}>
                      {sop.category.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {sop.parsed_content ? (
                      <Badge variant="outline" className="bg-green-100 text-green-700">
                        Yes ({(sop.action_items as unknown[])?.length || 0} actions)
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-yellow-100 text-yellow-700">
                        No
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => parseSOP(sop)}
                        disabled={parsingIds.has(sop.id)}
                        title="Parse with AI"
                      >
                        {parsingIds.has(sop.id) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Brain className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteSOP(sop.id)}
                        title="Delete"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
