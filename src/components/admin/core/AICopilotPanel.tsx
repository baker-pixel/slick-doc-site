import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { AdminSection } from "@/components/admin/core/AdminSidebar";
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
  Send,
  Building2,
  ChevronRight,
  ArrowLeft,
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
  navigateTo?: { section: AdminSection; hash?: string };
}

const quickCommands: QuickCommand[] = [
  {
    id: "social-batch",
    label: "Social Media Posts",
    description: "Generate 10 ready-to-post social updates",
    icon: <Send className="w-5 h-5" />,
    prompt:
      "Create 10 social media posts for {clientName} in the {industry} industry. Mix of formats: 3 tips/educational, 2 testimonial requests, 2 service highlights, 2 engagement questions, 1 company culture. Each post should be platform-ready with hashtag suggestions.",
    navigateTo: { section: "quick-actions", hash: "#generated-content" },
  },
  {
    id: "gbp-posts",
    label: "Google Business Posts",
    description: "5 GBP posts with CTAs",
    icon: <MapPin className="w-5 h-5" />,
    prompt:
      "Create 5 engaging Google Business Profile posts for {clientName} in the {industry} industry. Each post should be under 300 characters, include a call-to-action, and cover different topics: 1) Service highlight, 2) Customer testimonial prompt, 3) Seasonal/timely content, 4) Behind-the-scenes, 5) Special offer or promotion.",
    navigateTo: { section: "quick-actions", hash: "#generated-content" },
  },
  {
    id: "email-newsletter",
    label: "Monthly Newsletter",
    description: "Draft a complete newsletter",
    icon: <Mail className="w-5 h-5" />,
    prompt:
      "Draft a monthly email newsletter for {clientName}'s customers. Include: compelling subject line, 1 main feature story about their services, 2-3 quick tips related to {industry}, a customer spotlight section placeholder, and seasonal/timely content.",
    navigateTo: { section: "quick-actions", hash: "#generated-content" },
  },
  {
    id: "service-pages",
    label: "Service Page Copy",
    description: "SEO-optimized web content",
    icon: <FileText className="w-5 h-5" />,
    prompt:
      "Write 2 SEO-optimized service page drafts for {clientName}. Each page should include: H1 headline, meta description (155 chars), 3-4 sections with H2 headings, benefits-focused copy, and a clear CTA. Focus on their core services in the {industry} industry.",
    navigateTo: { section: "quick-actions", hash: "#generated-content" },
  },
  {
    id: "weekly-activity",
    label: "Weekly Report",
    description: "Summary of marketing activities",
    icon: <Calendar className="w-5 h-5" />,
    prompt:
      "Generate a comprehensive weekly activity report for {clientName}. Include social media engagement, content published, email campaigns sent, website traffic highlights, and key wins for the week.",
  },
];

export function AICopilotPanel({
  onNavigateToSection,
  selectedClientId: propSelectedClientId,
}: {
  onNavigateToSection?: (section: AdminSection) => void;
  selectedClientId?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [internalSelectedClientId, setInternalSelectedClientId] = useState<string>("");
  const selectedClientId = propSelectedClientId || internalSelectedClientId;
  const [isLoading, setIsLoading] = useState(false);
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  const [output, setOutput] = useState<string>("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

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

  const scrollToOutput = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  };

  const executeCommand = async (command: QuickCommand) => {
    if (!selectedClientId) return;

    setIsLoading(true);
    setActiveCommand(command.id);
    setOutput("");
    setShowCustom(false);

    const prompt = command.prompt
      .replace(/{clientName}/g, selectedClient?.business_name || "the client")
      .replace(/{industry}/g, selectedClient?.industry || "their");

    try {
      const response = await supabase.functions.invoke("chat", {
        body: {
          messages: [
            {
              role: "system",
              content: `You are a professional marketing strategist and content creator for ${selectedClient?.business_name}. Create high-quality, actionable content that is ready to use. Be specific, creative, and professional.`,
            },
            { role: "user", content: prompt },
          ],
        },
      });

      if (response.error) throw response.error;

      let finalContent = "";
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
        finalContent = result;
      } else {
        finalContent = response.data?.choices?.[0]?.message?.content || "No response generated";
        setOutput(finalContent);
      }

      // Save to generated_content if command has a destination
      if (finalContent.trim() && command.navigateTo) {
        const contentType = (() => {
          switch (command.id) {
            case "social-batch":
              return "social_post";
            case "gbp-posts":
              return "other";
            case "service-pages":
              return "blog_post";
            case "email-newsletter":
              return "email";
            default:
              return "other";
          }
        })();

        await supabase.from("generated_content").insert({
          client_id: selectedClientId,
          title: `${command.label} — ${selectedClient?.business_name ?? "Client"}`,
          content: finalContent,
          content_type: contentType,
          status: "draft",
          metadata: {
            source: "ai_copilot",
            command_id: command.id,
            generated_at: new Date().toISOString(),
          },
        });
      }

      toast({
        title: "Done!",
        description: `${command.label} ready for ${selectedClient?.business_name}`,
      });

      // Navigate to results
      if (command.navigateTo) {
        if (command.navigateTo.hash) window.location.hash = command.navigateTo.hash;
        onNavigateToSection?.(command.navigateTo.section);
        setIsOpen(false);
      } else {
        scrollToOutput();
      }
    } catch (error) {
      console.error("AI command error:", error);
      toast({
        title: "Generation failed",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setActiveCommand(null);
    }
  };

  const executeCustomPrompt = async () => {
    if (!customPrompt.trim() || !selectedClientId) return;

    setIsLoading(true);
    setActiveCommand("custom");
    setOutput("");

    const contextualPrompt = `For ${selectedClient?.business_name}${selectedClient?.industry ? ` (${selectedClient.industry})` : ""}: ${customPrompt}`;

    try {
      const response = await supabase.functions.invoke("chat", {
        body: {
          messages: [
            {
              role: "system",
              content: `You are a professional marketing strategist for ${selectedClient?.business_name}. Provide actionable, specific content and advice.`,
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
              } catch {}
            }
          }
        }
      } else {
        setOutput(response.data?.choices?.[0]?.message?.content || "No response generated");
      }

      setCustomPrompt("");
      scrollToOutput();
    } catch (error) {
      console.error("Custom prompt error:", error);
      toast({
        title: "Request failed",
        description: "Please try again.",
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
    toast({ title: "Copied!" });
  };

  const clearClient = () => {
    setInternalSelectedClientId("");
    setOutput("");
    setShowCustom(false);
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
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        {/* Header */}
        <SheetHeader className="p-5 pb-4 border-b bg-gradient-to-r from-violet-500/10 to-purple-500/10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <SheetTitle className="text-left">AI Copilot</SheetTitle>
              <p className="text-xs text-muted-foreground">One client at a time</p>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-5">
            {/* Step 1: No client selected */}
            {!selectedClientId ? (
              <div className="space-y-4">
                <div className="text-center py-8">
                  <div className="mx-auto h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">Select a Client</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Choose who you're working on today
                  </p>
                </div>

                <div className="space-y-2">
                  {clients.map((client) => (
                    <Card
                      key={client.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setInternalSelectedClientId(client.id)}
                    >
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{client.business_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {client.industry || "No industry"} • {client.tier}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              /* Step 2: Client selected - show actions */
              <div className="space-y-5">
                {/* Client header */}
                <div className="flex items-start justify-between">
                  <button
                    onClick={clearClient}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Change
                  </button>
                </div>

                <Card className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 border-violet-500/20">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                        {selectedClient?.business_name?.charAt(0) || "?"}
                      </div>
                      <div>
                        <p className="font-semibold text-lg">{selectedClient?.business_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedClient?.industry || "No industry"} • {selectedClient?.tier}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Quick commands */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">
                    What do you need?
                  </h3>
                  <div className="grid gap-2">
                    {quickCommands.map((command) => (
                      <button
                        key={command.id}
                        onClick={() => executeCommand(command)}
                        disabled={isLoading}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                          "hover:bg-muted/50 hover:border-primary/30",
                          activeCommand === command.id && "bg-primary/5 border-primary/40",
                          isLoading && activeCommand !== command.id && "opacity-50"
                        )}
                      >
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          {activeCommand === command.id && isLoading ? (
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          ) : (
                            command.icon
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{command.label}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {command.description}
                          </p>
                        </div>
                        {command.navigateTo && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            Auto-save
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom request toggle */}
                <div>
                  {!showCustom ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowCustom(true)}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Ask something custom
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Textarea
                        placeholder={`Ask anything about ${selectedClient?.business_name}...`}
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        className="min-h-[80px] resize-none"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowCustom(false);
                            setCustomPrompt("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={executeCustomPrompt}
                          disabled={isLoading || !customPrompt.trim()}
                        >
                          {isLoading && activeCommand === "custom" ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          Send
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Output */}
                {output && (
                  <div ref={outputRef} className="pt-4 border-t">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium">Result</h3>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOutput("")}>
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyToClipboard}>
                          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                      {output}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
