import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Sparkles, 
  Calendar, 
  FileText, 
  Mail, 
  MapPin, 
  Loader2, 
  Copy, 
  Check,
  Zap,
  RefreshCw,
  Send
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Client {
  id: string;
  business_name: string;
  industry: string | null;
  tier: string;
}

interface QuickCommand {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  prompt: string;
  category: "content" | "email" | "reporting";
}

const quickCommands: QuickCommand[] = [
  {
    id: "weekly-activity",
    label: "Generate Weekly Activity",
    description: "Create a summary of this week's marketing activities",
    icon: <Calendar className="w-4 h-4" />,
    prompt: "Generate a comprehensive weekly activity report for {clientName}. Include social media engagement, content published, email campaigns sent, website traffic highlights, and key wins for the week.",
    category: "reporting",
  },
  {
    id: "gbp-posts",
    label: "Create 5 GBP Posts",
    description: "Generate Google Business Profile posts",
    icon: <MapPin className="w-4 h-4" />,
    prompt: "Create 5 engaging Google Business Profile posts for {clientName} in the {industry} industry. Each post should be under 300 characters, include a call-to-action, and cover different topics: 1) Service highlight, 2) Customer testimonial prompt, 3) Seasonal/timely content, 4) Behind-the-scenes, 5) Special offer or promotion.",
    category: "content",
  },
  {
    id: "service-pages",
    label: "Draft 2 Service Pages",
    description: "Create SEO-optimized service page content",
    icon: <FileText className="w-4 h-4" />,
    prompt: "Write 2 SEO-optimized service page drafts for {clientName}. Each page should include: H1 headline, meta description (155 chars), 3-4 sections with H2 headings, benefits-focused copy, and a clear CTA. Focus on their core services in the {industry} industry.",
    category: "content",
  },
  {
    id: "churn-email",
    label: "Write Churn-Risk Email",
    description: "Re-engagement email for at-risk clients",
    icon: <Mail className="w-4 h-4" />,
    prompt: "Write a warm, professional re-engagement email for {clientName} who may be at risk of churning. The email should: acknowledge their value as a client, highlight recent wins or progress, address potential concerns proactively, and include a soft CTA for a check-in call.",
    category: "email",
  },
  {
    id: "social-batch",
    label: "Create Social Media Batch",
    description: "Generate 10 social posts for the month",
    icon: <Send className="w-4 h-4" />,
    prompt: "Create 10 social media posts for {clientName} in the {industry} industry. Mix of formats: 3 tips/educational, 2 testimonial requests, 2 service highlights, 2 engagement questions, 1 company culture. Each post should be platform-ready with hashtag suggestions.",
    category: "content",
  },
  {
    id: "email-newsletter",
    label: "Draft Monthly Newsletter",
    description: "Create a newsletter template",
    icon: <Mail className="w-4 h-4" />,
    prompt: "Draft a monthly email newsletter for {clientName}'s customers. Include: compelling subject line, 1 main feature story about their services, 2-3 quick tips related to {industry}, a customer spotlight section placeholder, and seasonal/timely content.",
    category: "email",
  },
];

export function AICopilotPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  const [output, setOutput] = useState<string>("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to output when it appears
  useEffect(() => {
    if (output && outputRef.current && scrollAreaRef.current) {
      setTimeout(() => {
        const scrollContainer = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollContainer && outputRef.current) {
          const containerRect = scrollContainer.getBoundingClientRect();
          const outputRect = outputRef.current.getBoundingClientRect();
          const scrollTop = scrollContainer.scrollTop + (outputRect.top - containerRect.top) - 20;
          scrollContainer.scrollTo({ top: scrollTop, behavior: 'smooth' });
        }
      }, 150);
    }
  }, [output]);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from("client_accounts")
      .select("id, business_name, industry, tier")
      .eq("status", "active")
      .order("business_name");

    if (!error && data) {
      setClients(data);
    }
  };

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  const executeCommand = async (command: QuickCommand) => {
    if (!selectedClientId) {
      toast({
        title: "Select a client",
        description: "Please select a client before running commands",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setActiveCommand(command.id);
    setOutput("");

    const prompt = command.prompt
      .replace(/{clientName}/g, selectedClient?.business_name || "the client")
      .replace(/{industry}/g, selectedClient?.industry || "their");

    try {
      const response = await supabase.functions.invoke("chat", {
        body: {
          messages: [
            {
              role: "system",
              content: `You are a professional marketing strategist and content creator. Create high-quality, actionable content that is ready to use. Be specific, creative, and professional.`,
            },
            { role: "user", content: prompt },
          ],
        },
      });

      if (response.error) throw response.error;

      // Handle streaming response
      const reader = response.data.getReader?.();
      if (reader) {
        const decoder = new TextDecoder();
        let result = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                const content = data.choices?.[0]?.delta?.content;
                if (content) {
                  result += content;
                  setOutput(result);
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }
      } else {
        // Non-streaming fallback
        setOutput(response.data?.choices?.[0]?.message?.content || "No response generated");
      }

      toast({
        title: "Content generated",
        description: `${command.label} completed successfully`,
      });
    } catch (error) {
      console.error("AI command error:", error);
      toast({
        title: "Generation failed",
        description: "Unable to generate content. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setActiveCommand(null);
    }
  };

  const executeCustomPrompt = async () => {
    if (!customPrompt.trim()) return;

    if (!selectedClientId) {
      toast({
        title: "Select a client",
        description: "Please select a client for context",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setActiveCommand("custom");
    setOutput("");

    const contextualPrompt = `For ${selectedClient?.business_name}${selectedClient?.industry ? ` in the ${selectedClient.industry} industry` : ""}: ${customPrompt}`;

    try {
      const response = await supabase.functions.invoke("chat", {
        body: {
          messages: [
            {
              role: "system",
              content: `You are a professional marketing strategist helping manage marketing for local businesses. Provide actionable, specific content and advice.`,
            },
            { role: "user", content: contextualPrompt },
          ],
        },
      });

      if (response.error) throw response.error;

      const reader = response.data.getReader?.();
      if (reader) {
        const decoder = new TextDecoder();
        let result = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                const content = data.choices?.[0]?.delta?.content;
                if (content) {
                  result += content;
                  setOutput(result);
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }
      } else {
        setOutput(response.data?.choices?.[0]?.message?.content || "No response generated");
      }

      setCustomPrompt("");
    } catch (error) {
      console.error("Custom prompt error:", error);
      toast({
        title: "Request failed",
        description: "Unable to process request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setActiveCommand(null);
    }
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const getCategoryColor = (category: QuickCommand["category"]) => {
    switch (category) {
      case "content":
        return "bg-primary/10 text-primary border-primary/20";
      case "email":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "reporting":
        return "bg-green-500/10 text-green-600 border-green-500/20";
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          className="fixed right-6 bottom-24 z-50 h-12 w-12 rounded-full shadow-lg bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 border-0"
          size="icon"
        >
          <Sparkles className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <SheetTitle className="text-left">AI Copilot</SheetTitle>
              <p className="text-sm text-muted-foreground">Your marketing command center</p>
            </div>
          </div>
        </SheetHeader>

        <div className="p-4 border-b bg-muted/30">
          <label className="text-sm font-medium mb-2 block">Select Client</label>
          <Select value={selectedClientId} onValueChange={setSelectedClientId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a client..." />
            </SelectTrigger>
            <SelectContent>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  <div className="flex items-center gap-2">
                    <span>{client.business_name}</span>
                    <Badge variant="outline" className="text-xs">
                      {client.tier}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedClient && (
            <p className="text-xs text-muted-foreground mt-2">
              Industry: {selectedClient.industry || "Not specified"}
            </p>
          )}
        </div>

        <ScrollArea className="flex-1" ref={scrollAreaRef}>
          <div className="p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Quick Commands
              </h3>
              <div className="grid gap-2">
                {quickCommands.map((command) => (
                  <Card
                    key={command.id}
                    className={cn(
                      "cursor-pointer transition-all hover:shadow-md hover:border-primary/40",
                      activeCommand === command.id && "border-primary ring-1 ring-primary/20"
                    )}
                    onClick={() => !isLoading && executeCommand(command)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          {activeCommand === command.id && isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          ) : (
                            command.icon
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{command.label}</span>
                            <Badge
                              variant="outline"
                              className={cn("text-[10px] px-1.5", getCategoryColor(command.category))}
                            >
                              {command.category}
                            </Badge>
                          </div>
                          <CardDescription className="text-xs line-clamp-1">
                            {command.description}
                          </CardDescription>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <h3 className="text-sm font-semibold mb-3">Custom Request</h3>
              <div className="space-y-2">
                <Textarea
                  placeholder="Ask anything... e.g., 'Write a follow-up email for their website project'"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="min-h-[80px] resize-none"
                />
                <Button
                  className="w-full"
                  onClick={executeCustomPrompt}
                  disabled={isLoading || !customPrompt.trim()}
                >
                  {isLoading && activeCommand === "custom" ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Send Request
                </Button>
              </div>
            </div>

            {output && (
              <div ref={outputRef} className="pt-4 border-t">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Generated Output</h3>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOutput("")}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={copyToClipboard}
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                  {output}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
