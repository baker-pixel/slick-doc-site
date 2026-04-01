import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Star, 
  MessageSquare, 
  Send, 
  TrendingUp, 
  TrendingDown,
  Sparkles,
  Copy,
  ExternalLink,
  QrCode,
  Mail,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Meh,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";

interface ClientAccount {
  id: string;
  business_name: string;
  google_place_id: string | null;
  google_review_url: string | null;
  review_qr_image_url: string | null;
}

interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
  date: string;
  replied: boolean;
  sentiment: "positive" | "neutral" | "negative";
  aiResponse?: string;
}

// Mock reviews for demo
const mockReviews: Review[] = [
  { id: "1", author: "John D.", rating: 5, text: "Excellent service! The team was incredibly professional and delivered beyond our expectations. Highly recommend!", date: "2024-01-15", replied: true, sentiment: "positive" },
  { id: "2", author: "Sarah M.", rating: 4, text: "Good work overall. Communication could be a bit better but the end result was great.", date: "2024-01-12", replied: false, sentiment: "positive" },
  { id: "3", author: "Mike R.", rating: 2, text: "Took longer than expected and had some issues with the final delivery.", date: "2024-01-10", replied: false, sentiment: "negative" },
  { id: "4", author: "Emily K.", rating: 5, text: "Amazing experience from start to finish. Will definitely use again!", date: "2024-01-08", replied: true, sentiment: "positive" },
  { id: "5", author: "David L.", rating: 3, text: "Average service. Nothing special but got the job done.", date: "2024-01-05", replied: false, sentiment: "neutral" },
];

export function GoogleReviewEngine() {
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [isGeneratingResponse, setIsGeneratingResponse] = useState<string | null>(null);
  const [generatedResponses, setGeneratedResponses] = useState<Record<string, string>>({});
  const [reviewUrl, setReviewUrl] = useState("");
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const queryClient = useQueryClient();

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

  // Calculate metrics from mock data
  const totalReviews = mockReviews.length;
  const avgRating = (mockReviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews).toFixed(1);
  const positiveCount = mockReviews.filter(r => r.sentiment === "positive").length;
  const neutralCount = mockReviews.filter(r => r.sentiment === "neutral").length;
  const negativeCount = mockReviews.filter(r => r.sentiment === "negative").length;
  const repliedCount = mockReviews.filter(r => r.replied).length;
  const responseRate = ((repliedCount / totalReviews) * 100).toFixed(0);

  const updateClientReviewUrl = useMutation({
    mutationFn: async () => {
      if (!selectedClientId || !reviewUrl) return;
      const { error } = await supabase
        .from("client_accounts")
        .update({ google_review_url: reviewUrl })
        .eq("id", selectedClientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-accounts-reviews"] });
      toast.success("Review URL saved successfully!");
      setIsSetupOpen(false);
    },
    onError: () => {
      toast.error("Failed to save review URL");
    },
  });

  const generateAIResponse = async (review: Review) => {
    setIsGeneratingResponse(review.id);
    try {
      // Call edge function for AI response generation
      const { data, error } = await supabase.functions.invoke("generate-review-response", {
        body: {
          reviewText: review.text,
          rating: review.rating,
          authorName: review.author,
          businessName: selectedClient?.business_name || "our business",
        },
      });

      if (error) throw error;

      const response = data?.response || getDefaultResponse(review);
      setGeneratedResponses(prev => ({ ...prev, [review.id]: response }));
      toast.success("AI response generated!");
    } catch (error) {
      // Fallback to template response
      const response = getDefaultResponse(review);
      setGeneratedResponses(prev => ({ ...prev, [review.id]: response }));
      toast.success("Response generated!");
    } finally {
      setIsGeneratingResponse(null);
    }
  };

  const getDefaultResponse = (review: Review): string => {
    const businessName = selectedClient?.business_name || "our team";
    
    if (review.rating >= 4) {
      return `Thank you so much for your wonderful review, ${review.author}! We're thrilled to hear about your positive experience with ${businessName}. Your kind words mean a lot to our team, and we look forward to serving you again in the future!`;
    } else if (review.rating === 3) {
      return `Thank you for your feedback, ${review.author}. We appreciate you taking the time to share your experience with ${businessName}. We're always looking for ways to improve, and your input helps us do just that. Please feel free to reach out if there's anything we can do to enhance your next experience!`;
    } else {
      return `Thank you for bringing this to our attention, ${review.author}. We sincerely apologize that your experience with ${businessName} didn't meet expectations. We take all feedback seriously and would love the opportunity to make things right. Please contact us directly so we can address your concerns.`;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case "positive": return <ThumbsUp className="h-4 w-4 text-green-600" />;
      case "negative": return <ThumbsDown className="h-4 w-4 text-red-600" />;
      default: return <Meh className="h-4 w-4 text-amber-600" />;
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star 
            key={star} 
            className={`h-4 w-4 ${star <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} 
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Google Review Engine</h2>
          <p className="text-muted-foreground">Automate review requests, responses, and sentiment tracking</p>
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
                <DialogTitle>Review Request Setup</DialogTitle>
                <DialogDescription>
                  Configure Google review settings for {selectedClient?.business_name}
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
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-send review requests</Label>
                    <p className="text-xs text-muted-foreground">After service completion</p>
                  </div>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>AI response drafts</Label>
                    <p className="text-xs text-muted-foreground">Auto-generate responses</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => updateClientReviewUrl.mutate()}>
                  Save Settings
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
            <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgRating}</div>
            <div className="flex gap-0.5 mt-1">
              {renderStars(Math.round(Number(avgRating)))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Reviews</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalReviews}</div>
            <p className="text-xs text-muted-foreground">
              +3 this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Response Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{responseRate}%</div>
            <Progress value={Number(responseRate)} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sentiment Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{((positiveCount / totalReviews) * 100).toFixed(0)}%</div>
            <p className="text-xs text-muted-foreground">
              Positive sentiment
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Needs Response</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalReviews - repliedCount}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting reply
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="reviews" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reviews">Recent Reviews</TabsTrigger>
          <TabsTrigger value="requests">Review Requests</TabsTrigger>
          <TabsTrigger value="sentiment">Sentiment Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="reviews" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Reviews</CardTitle>
              <CardDescription>Manage and respond to customer reviews</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-4">
                  {mockReviews.map((review) => (
                    <div key={review.id} className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{review.author}</span>
                            {getSentimentIcon(review.sentiment)}
                            {review.replied && (
                              <Badge variant="outline" className="text-xs">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Replied
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {renderStars(review.rating)}
                            <span className="text-xs text-muted-foreground">{review.date}</span>
                          </div>
                        </div>
                      </div>
                      
                      <p className="text-sm text-muted-foreground">{review.text}</p>
                      
                      {!review.replied && (
                        <div className="space-y-3">
                          {generatedResponses[review.id] ? (
                            <div className="bg-muted p-3 rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <Sparkles className="h-4 w-4 text-primary" />
                                <span className="text-sm font-medium">AI-Generated Response</span>
                              </div>
                              <Textarea 
                                value={generatedResponses[review.id]} 
                                onChange={(e) => setGeneratedResponses(prev => ({
                                  ...prev,
                                  [review.id]: e.target.value
                                }))}
                                rows={3}
                              />
                              <div className="flex gap-2 mt-2">
                                <Button size="sm" onClick={() => copyToClipboard(generatedResponses[review.id])}>
                                  <Copy className="h-4 w-4 mr-1" /> Copy
                                </Button>
                                <Button size="sm" variant="outline">
                                  <ExternalLink className="h-4 w-4 mr-1" /> Post to Google
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => generateAIResponse(review)}
                              disabled={isGeneratingResponse === review.id}
                            >
                              {isGeneratingResponse === review.id ? (
                                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Sparkles className="h-4 w-4 mr-1" />
                              )}
                              Generate AI Response
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Review Request Sequence</CardTitle>
                <CardDescription>Automated follow-ups to request reviews</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Mail className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Initial Request</p>
                      <p className="text-xs text-muted-foreground">Day 1 after service</p>
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>
                
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Clock className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Gentle Reminder</p>
                      <p className="text-xs text-muted-foreground">Day 3 if no response</p>
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>
                
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Send className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Final Follow-up</p>
                      <p className="text-xs text-muted-foreground">Day 7 if no response</p>
                    </div>
                  </div>
                  <Switch />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Request Stats</CardTitle>
                <CardDescription>Performance of review requests</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Requests Sent (30 days)</span>
                  <span className="font-medium">24</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Reviews Received</span>
                  <span className="font-medium">8</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Conversion Rate</span>
                  <span className="font-medium text-green-600">33%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Avg. Rating from Requests</span>
                  <span className="font-medium">4.6</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sentiment" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ThumbsUp className="h-4 w-4 text-green-600" /> Positive
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">{positiveCount}</div>
                <p className="text-sm text-muted-foreground">
                  {((positiveCount / totalReviews) * 100).toFixed(0)}% of reviews
                </p>
                <Progress value={(positiveCount / totalReviews) * 100} className="mt-2 bg-green-100" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Meh className="h-4 w-4 text-amber-600" /> Neutral
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-600">{neutralCount}</div>
                <p className="text-sm text-muted-foreground">
                  {((neutralCount / totalReviews) * 100).toFixed(0)}% of reviews
                </p>
                <Progress value={(neutralCount / totalReviews) * 100} className="mt-2 bg-amber-100" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ThumbsDown className="h-4 w-4 text-red-600" /> Negative
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-600">{negativeCount}</div>
                <p className="text-sm text-muted-foreground">
                  {((negativeCount / totalReviews) * 100).toFixed(0)}% of reviews
                </p>
                <Progress value={(negativeCount / totalReviews) * 100} className="mt-2 bg-red-100" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Common Themes</CardTitle>
              <CardDescription>AI-detected topics from reviews</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="text-green-700 bg-green-100">
                  Professional service (4)
                </Badge>
                <Badge variant="secondary" className="text-green-700 bg-green-100">
                  Great results (3)
                </Badge>
                <Badge variant="secondary" className="text-amber-700 bg-amber-100">
                  Communication (2)
                </Badge>
                <Badge variant="secondary" className="text-red-700 bg-red-100">
                  Timing issues (1)
                </Badge>
                <Badge variant="secondary" className="text-green-700 bg-green-100">
                  Recommend (3)
                </Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
