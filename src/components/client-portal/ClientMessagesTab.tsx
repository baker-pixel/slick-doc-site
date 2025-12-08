import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, MessageCircle, User, Building2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  client_account_id: string;
  sender_type: "client" | "agency";
  sender_name: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface ClientMessagesTabProps {
  clientAccountId: string;
  clientName?: string;
}

export default function ClientMessagesTab({ clientAccountId, clientName }: ClientMessagesTabProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    fetchMessages();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('client-messages-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'client_messages',
          filter: `client_account_id=eq.${clientAccountId}`,
        },
        (payload) => {
          console.log('New message received:', payload);
          const newMsg = payload.new as Message;
          setMessages((prev) => [...prev, newMsg]);
          
          // Mark agency messages as read
          if (newMsg.sender_type === 'agency') {
            markAsRead(newMsg.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientAccountId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from("client_messages")
        .select("*")
        .eq("client_account_id", clientAccountId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages((data || []) as Message[]);

      // Mark unread agency messages as read
      const unreadAgencyMessages = (data || []).filter(
        (m) => m.sender_type === "agency" && !m.is_read
      );
      for (const msg of unreadAgencyMessages) {
        await markAsRead(msg.id);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
      toast({
        title: "Error",
        description: "Failed to load messages",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (messageId: string) => {
    try {
      await supabase
        .from("client_messages")
        .update({ is_read: true })
        .eq("id", messageId);
    } catch (error) {
      console.error("Error marking message as read:", error);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim()) return;

    setSending(true);
    try {
      const { error } = await supabase.from("client_messages").insert({
        client_account_id: clientAccountId,
        sender_type: "client",
        sender_name: clientName || "Client",
        message: newMessage.trim(),
      });

      if (error) throw error;

      setNewMessage("");
      toast({
        title: "Message sent",
        description: "Your message has been sent to the team",
      });
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Failed to send",
        description: "Please try again",
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

  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) {
      return `Today at ${format(date, "h:mm a")}`;
    }
    if (isYesterday(date)) {
      return `Yesterday at ${format(date, "h:mm a")}`;
    }
    return format(date, "MMM d, yyyy 'at' h:mm a");
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

  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM d, yyyy");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const messageGroups = groupMessagesByDate(messages);

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="shrink-0 border-b">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Messages</CardTitle>
            <CardDescription>
              Chat with your agency team
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No messages yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Send a message to start a conversation with your agency team. We typically respond within a few hours.
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
                        msg.sender_type === "client" ? "flex-row-reverse" : "flex-row"
                      )}
                    >
                      <div
                        className={cn(
                          "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                          msg.sender_type === "client"
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary"
                        )}
                      >
                        {msg.sender_type === "client" ? (
                          <User className="h-4 w-4" />
                        ) : (
                          <Building2 className="h-4 w-4" />
                        )}
                      </div>
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-4 py-2",
                          msg.sender_type === "client"
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-secondary rounded-tl-sm"
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                        <p
                          className={cn(
                            "text-xs mt-1",
                            msg.sender_type === "client"
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
            placeholder="Type your message..."
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
        <p className="text-xs text-muted-foreground mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </Card>
  );
}
