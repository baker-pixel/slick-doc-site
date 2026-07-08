import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Star, Sparkles, Copy, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { callAdminApi } from "@/lib/admin-api";

interface ClientAccount {
  id: string;
  business_name: string;
  google_place_id: string | null;
  google_review_url: string | null;
  review_qr_image_url: string | null;
}

export function GoogleReviewEngine() {
  const { adminPassword } = useAdminAuth();
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [reviewUrl, setReviewUrl] = useState("");
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const queryClient = useQueryClient();

  // Draft-a-reply tool state — there is no live Google Business Profile sync
  // in this app (would need Google API/OAuth credentials that aren't
  // provisioned). Admin pastes in a real review they're looking at in
  // Google Business Profile and gets a real AI-drafted reply for it.
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [authorName, setAuthorName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [draftedResponse, setDraftedResponse] = useState("");

  const { data: clients = [] } = useQuery({
    queryKey: ["client-accounts-reviews"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_accounts")
        .select("id, business_name, google_place_id, google_review_url, review_qr_image_url")
        .order("business_name", { ascending: true });
      if (error) throw error;
      return data as ClientAccount[];
    },
  });

  const selectedClient = clients.find(c => c.id === selectedClientId);

  const updateClientReviewUrl = useMutation({
    mutationFn: async () => {
      if (!selectedClientId || !reviewUrl) return;
      const { error } = await callAdminApi(adminPassword, {
        action: "update",
        table: "client_accounts",
        id: selectedClientId,
        data: { google_review_url: reviewUrl },
      });
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-accounts-reviews"] });
      toast.success("Review URL saved");
      setIsSetupOpen(false);
    },
    onError: () => {
      toast.error("Failed to save review URL");
    },
  });

  const generateResponse = async () => {
    if (!selectedClient) {
      toast.error("Select a client first");
      return;
    }
    if (!reviewText.trim()) {
      toast.error("Paste the review text first");
      return;
    }
    setIsGenerating(true);
    setDraftedResponse("");
    try {
      const { data, error } = await supabase.functions.invoke("generate-review-response", {
        body: {
          reviewText,
          rating: reviewRating,
          authorName: authorName || undefined,
          businessName: selectedClient.business_name,
          password: adminPassword,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDraftedResponse(data.response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to generate reply", { description: message });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Google Reviews</h2>
          <p className="text-muted-foreground">Set up a client's review link, and draft replies to reviews you're looking at in Google Business Profile.</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedClientId} onValueChange={setSelectedClientId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select a client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.business_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={isSetupOpen} onOpenChange={setIsSetupOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={!selectedClientId}>
                <QrCode className="mr-2 h-4 w-4" />
                Setup
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Review Link Setup</DialogTitle>
                <DialogDescription>
                  Set the Google review link for {selectedClient?.business_name}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Google Review URL</Label>
                  <Input
                    placeholder="https://g.page/r/..."
                    value={reviewUrl || selectedClient?.google_review_url || ""}
                    onChange={(e) => setReviewUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Find this in Google Business Profile → Share review form
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => updateClientReviewUrl.mutate()}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Draft a reply
          </CardTitle>
          <CardDescription>
            Paste in a review from Google Business Profile — there's no live sync into this app yet, so bring the review text over manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedClient && (
            <p className="text-sm text-muted-foreground">Select a client above to get started.</p>
          )}
          {selectedClient && (
            <>
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <div className="space-y-2">
                  <Label>Reviewer name (optional)</Label>
                  <Input value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="e.g. Sarah M." />
                </div>
                <div className="space-y-2">
                  <Label>Rating</Label>
                  <Select value={String(reviewRating)} onValueChange={(v) => setReviewRating(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[5, 4, 3, 2, 1].map((r) => (
                        <SelectItem key={r} value={String(r)}>
                          <span className="flex items-center gap-1">
                            {r} <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Review text</Label>
                <Textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Paste the review here..."
                  rows={4}
                />
              </div>
              <Button onClick={generateResponse} disabled={isGenerating || !reviewText.trim()}>
                {isGenerating ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Draft reply
              </Button>

              {draftedResponse && (
                <div className="bg-muted p-3 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Drafted reply</span>
                  </div>
                  <Textarea
                    value={draftedResponse}
                    onChange={(e) => setDraftedResponse(e.target.value)}
                    rows={3}
                  />
                  <Button size="sm" onClick={() => copyToClipboard(draftedResponse)}>
                    <Copy className="h-4 w-4 mr-1" /> Copy
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
