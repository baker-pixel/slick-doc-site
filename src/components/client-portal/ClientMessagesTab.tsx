import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import { Loader2, Send, MessageCircle, User, Building2, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import { ModernCard, EmptyState } from "./PortalUI";

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

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    fetchMessages();

    const channel = supabase
      .channel('client-messages-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'client_messages', filter: `client_account_id=eq.${clientAccountId}` }, (payload) => {
        const newMsg = payload.new as Message;
        setMessages((prev) => [...prev, newMsg]);
        if (newMsg.sender_type === 'agency') markAsRead(newMsg.id);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clientAccountId]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from("client_messages")
        .select("*")
        .eq("client_account_id", clientAccountId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages((data || []) as Message[]);

      const unreadAgencyMessages = (data || []).filter((m) => m.sender_type === "agency" && !m.is_read);
      for (const msg of unreadAgencyMessages) await markAsRead(msg.id);
    } catch (error) {
      console.error("Error fetching messages:", error);
      toast({ title: "Error", description: "Failed to load messages", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (messageId: string) => {
    try {
      await supabase.from("client_messages").update({ is_read: true }).eq("id", messageId);
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
      toast({ title: "Message sent", description: "Your message has been sent to the team" });
    } catch (error) {
      console.error("Error sending message:", error);
      toast({ title: "Failed to send", description: "Please try again", variant: "destructive" });
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
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
            <Loader2 className="h-7 w-7 text-primary-foreground animate-spin" />
          </div>
          <p className="text-muted-foreground">Loading messages...</p>
        </div>
      </div>
    );
  }

  const messageGroups = groupMessagesByDate(messages);

  return (
    <ModernCard className="flex flex-col h-[650px]" padding="none" hover={false}>
      {/* Header */}
      <div className="shrink-0 p-6 border-b border-border/50">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/20">
            <MessageCircle className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Messages</h2>
            <p className="text-sm text-muted-foreground">Chat with your agency team</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <MessageCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No messages yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Send a message to start a conversation with your agency team. We typically respond within a few hours.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {messageGroups.map((group) => (
              <div key={group.date}>
                <div className="flex items-center justify-center mb-4">
                  <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-4 py-1.5 rounded-full">
                    {getDateLabel(group.date)}
                  </span>
                </div>
                <div className="space-y-3">
                  {group.messages.map((msg, index) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.05 }}
                      className={cn("flex gap-3", msg.sender_type === "client" ? "flex-row-reverse" : "flex-row")}
                    >
                      <div className={cn(
                        "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                        msg.sender_type === "client"
                          ? "bg-gradient-to-br from-primary to-primary/80"
                          : "bg-gradient-to-br from-muted to-muted/80 border border-border/50"
                      )}>
                        {msg.sender_type === "client" ? (
                          <User className="h-4 w-4 text-primary-foreground" />
                        ) : (
                          <Building2 className="h-4 w-4 text-foreground" />
                        )}
                      </div>
                      <div className={cn(
                        "max-w-[75%] rounded-2xl px-4 py-3 shadow-sm",
                        msg.sender_type === "client"
                          ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-tr-md"
                          : "bg-card border border-border/50 rounded-tl-md"
                      )}>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                        <p className={cn(
                          "text-[10px] mt-1.5",
                          msg.sender_type === "client" ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}>
                          {format(new Date(msg.created_at), "h:mm a")}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border/50 p-4 bg-muted/30">
        <div className="flex gap-3">
          <Textarea
            placeholder="Type your message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[48px] max-h-[120px] resize-none rounded-xl bg-background border-border/50 focus-visible:ring-primary/50"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={sending || !newMessage.trim()}
            size="icon"
            className="shrink-0 h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">Press Enter to send, Shift+Enter for new line</p>
      </div>
    </ModernCard>
  );
}
