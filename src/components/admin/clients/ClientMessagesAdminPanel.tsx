import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { callAdminApi } from "@/lib/admin-api";
import { friendlyEdgeMessage } from "@/lib/edge-error";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, MessageCircle, User, Building2, Inbox } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";

interface ClientAccount {
  id: string;
  business_name: string;
}

interface Message {
  id: string;
  client_account_id: string;
  sender_type: "client" | "agency";
  sender_name: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface ConversationSummary {
  clientId: string;
  businessName: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

export default function ClientMessagesAdminPanel({ clientId }: { clientId?: string } = {}) {
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedClient, setSelectedClient] = useState<string | null>(clientId || null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      fetchMessages(selectedClient);

      const channel = supabase
        .channel('admin-messages-realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'client_messages',
            filter: `client_account_id=eq.${selectedClient}`,
          },
          (payload) => {
            const newMsg = payload.new as Message;
            setMessages((prev) => [...prev, newMsg]);
            if (newMsg.sender_type === 'client') {
              markAsRead(newMsg.id);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedClient]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from("client_accounts")
        .select("id, business_name")
        .order("business_name");

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error("Error fetching clients:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (clientId: string) => {
    try {
      const adminPassword = localStorage.getItem("admin_password");
      const { data, error } = await supabase.functions.invoke("admin", {
        body: {
          action: "get_messages",
          password: adminPassword,
          data: { client_account_id: clientId },
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      const messagesData = data?.data || [];
      setMessages(messagesData as Message[]);

      // Mark unread client messages as read
      const unread = messagesData.filter((m: Message) => m.sender_type === "client" && !m.is_read);
      for (const msg of unread) {
        await markAsRead(msg.id);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  const markAsRead = async (messageId: string) => {
    try {
      const adminPassword = localStorage.getItem("admin_password");
      await supabase.functions.invoke("admin", {
        body: {
          action: "mark_message_read",
          password: adminPassword,
          id: messageId,
        },
      });
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedClient) return;

    setSending(true);
    try {
      const adminPassword = localStorage.getItem("admin_password");
      const { data, error } = await supabase.functions.invoke("admin", {
        body: {
          action: "send_message",
          password: adminPassword,
          data: {
            client_account_id: selectedClient,
            message: newMessage.trim(),
            sender_name: "Agency Team",
          },
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setNewMessage("");
      toast({
        title: "Message sent",
        description: "Your reply has been sent to the client",
      });
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast({
        title: "Failed to send",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM d, yyyy");
  };

  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = "";

    msgs.forEach((msg) => {
      const msgDate = format(new Date(msg.created_at), "yyyy-MM-dd");
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });

    return groups;
  };

  const selectedClientName = clients.find((c) => c.id === selectedClient)?.business_name;
  const messageGroups = groupMessagesByDate(messages);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Client List */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-lg">Conversations</CardTitle>
          <CardDescription>Select a client to view messages</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y max-h-[500px] overflow-y-auto">
            {clients.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                No clients found
              </div>
            ) : (
              clients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => setSelectedClient(client.id)}
                  className={cn(
                    "w-full px-4 py-3 text-left hover:bg-accent/50 transition-colors flex items-center gap-3",
                    selectedClient === client.id && "bg-accent"
                  )}
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{client.business_name}</p>
                    <p className="text-xs text-muted-foreground">Click to view messages</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Messages Panel */}
      <Card className="lg:col-span-2 flex flex-col h-[600px]">
        {!selectedClient ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <Inbox className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Select a conversation</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Choose a client from the list to view and respond to their messages
            </p>
          </div>
        ) : (
          <>
            <CardHeader className="shrink-0 border-b">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">{selectedClientName}</CardTitle>
                  <CardDescription>Client conversation</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No messages yet</h3>
                  <p className="text-sm text-muted-foreground">
                    Send the first message to start the conversation
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {messageGroups.map((group) => (
                    <div key={group.date}>
                      <div className="flex items-center justify-center mb-4">
                        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                          {getDateLabel(group.date)}
                        </span>
                      </div>
                      <div className="space-y-4">
                        {group.messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={cn(
                              "flex gap-3",
                              msg.sender_type === "agency" ? "flex-row-reverse" : "flex-row"
                            )}
                          >
                            <div
                              className={cn(
                                "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                                msg.sender_type === "agency"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary"
                              )}
                            >
                              {msg.sender_type === "agency" ? (
                                <Building2 className="h-4 w-4" />
                              ) : (
                                <User className="h-4 w-4" />
                              )}
                            </div>
                            <div
                              className={cn(
                                "max-w-[75%] rounded-2xl px-4 py-2",
                                msg.sender_type === "agency"
                                  ? "bg-primary text-primary-foreground rounded-tr-sm"
                                  : "bg-secondary rounded-tl-sm"
                              )}
                            >
                              <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                              <p
                                className={cn(
                                  "text-xs mt-1",
                                  msg.sender_type === "agency"
                                    ? "text-primary-foreground/70"
                                    : "text-muted-foreground"
                                )}
                              >
                                {format(new Date(msg.created_at), "h:mm a")}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </CardContent>

            <div className="shrink-0 border-t p-4">
              <div className="flex gap-3">
                <Textarea
                  placeholder="Type your reply..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="min-h-[44px] max-h-[120px] resize-none"
                  rows={1}
                />
                <Button
                  onClick={handleSend}
                  disabled={sending || !newMessage.trim()}
                  size="icon"
                  className="shrink-0 h-11 w-11"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
