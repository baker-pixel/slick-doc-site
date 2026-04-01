import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, formatDistanceToNow } from "date-fns";
import {
  MessageSquare,
  Mail,
  Calendar,
  FileText,
  Search,
  Filter,
  Building2,
  User,
  Clock,
  ArrowUpRight
} from "lucide-react";

interface ClientCommunicationLogProps {
  adminPassword: string;
}

export function ClientCommunicationLog({ adminPassword }: ClientCommunicationLogProps) {
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [communicationType, setCommunicationType] = useState<string>("all");

  // Fetch clients
  const { data: clients = [] } = useQuery({
    queryKey: ["comm-log-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_accounts")
        .select("id, business_name")
        .order("business_name");
      if (error) throw error;
      return data;
    }
  });

  // Fetch messages
  const { data: messages = [] } = useQuery({
    queryKey: ["comm-log-messages", selectedClient],
    queryFn: async () => {
      let query = supabase
        .from("client_messages")
        .select(`
          *,
          client_accounts (business_name)
        `)
        .order("created_at", { ascending: false })
        .limit(100);
      
      if (selectedClient !== "all") {
        query = query.eq("client_account_id", selectedClient);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });

  // Fetch email logs
  const { data: emailLogs = [] } = useQuery({
    queryKey: ["comm-log-emails", selectedClient],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_logs")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    }
  });

  // Fetch meetings
  const { data: meetings = [] } = useQuery({
    queryKey: ["comm-log-meetings", selectedClient],
    queryFn: async () => {
      let query = supabase
        .from("client_meetings")
        .select(`
          *,
          client_accounts (business_name)
        `)
        .order("scheduled_at", { ascending: false })
        .limit(50);
      
      if (selectedClient !== "all") {
        query = query.eq("client_account_id", selectedClient);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });

  // Fetch content approvals
  const { data: approvals = [] } = useQuery({
    queryKey: ["comm-log-approvals", selectedClient],
    queryFn: async () => {
      let query = supabase
        .from("content_approvals")
        .select(`
          *,
          client_accounts (business_name)
        `)
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (selectedClient !== "all") {
        query = query.eq("client_account_id", selectedClient);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });

  // Combine all communications into timeline
  const allCommunications = useMemo(() => {
    const combined: any[] = [];

    messages.forEach(msg => {
      combined.push({
        id: msg.id,
        type: "message",
        date: msg.created_at,
        client_name: msg.client_accounts?.business_name,
        client_id: msg.client_account_id,
        title: msg.sender_type === "client" ? "Client Message" : "Team Reply",
        content: msg.message,
        metadata: { sender_type: msg.sender_type, sender_name: msg.sender_name, is_read: msg.is_read }
      });
    });

    emailLogs.forEach(email => {
      combined.push({
        id: email.id,
        type: "email",
        date: email.sent_at,
        client_name: email.recipient_email,
        client_id: null,
        title: email.subject,
        content: `Sent to: ${email.recipient_email}`,
        metadata: { status: email.status, recipient: email.recipient_email }
      });
    });

    meetings.forEach(meeting => {
      combined.push({
        id: meeting.id,
        type: "meeting",
        date: meeting.scheduled_at,
        client_name: meeting.client_accounts?.business_name,
        client_id: meeting.client_account_id,
        title: meeting.title,
        content: meeting.description,
        metadata: { meeting_type: meeting.meeting_type, status: meeting.status }
      });
    });

    approvals.forEach(approval => {
      combined.push({
        id: approval.id,
        type: "approval",
        date: approval.created_at,
        client_name: approval.client_accounts?.business_name,
        client_id: approval.client_account_id,
        title: approval.title,
        content: `${approval.content_type} - ${approval.status}`,
        metadata: { content_type: approval.content_type, status: approval.status, feedback: approval.feedback }
      });
    });

    // Sort by date
    combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Filter by type
    if (communicationType !== "all") {
      return combined.filter(c => c.type === communicationType);
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return combined.filter(c => 
        c.title?.toLowerCase().includes(query) ||
        c.content?.toLowerCase().includes(query) ||
        c.client_name?.toLowerCase().includes(query)
      );
    }

    return combined;
  }, [messages, emailLogs, meetings, approvals, communicationType, searchQuery]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "message": return <MessageSquare className="h-4 w-4" />;
      case "email": return <Mail className="h-4 w-4" />;
      case "meeting": return <Calendar className="h-4 w-4" />;
      case "approval": return <FileText className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "message": return "bg-green-100 text-green-800";
      case "email": return "bg-blue-100 text-blue-800";
      case "meeting": return "bg-purple-100 text-purple-800";
      case "approval": return "bg-orange-100 text-orange-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  // Stats
  const stats = useMemo(() => {
    return {
      messages: messages.length,
      emails: emailLogs.length,
      meetings: meetings.length,
      approvals: approvals.length,
      unreadMessages: messages.filter(m => !m.is_read && m.sender_type === "client").length,
      pendingApprovals: approvals.filter(a => a.status === "pending").length
    };
  }, [messages, emailLogs, meetings, approvals]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Communication Log</h2>
          <p className="text-muted-foreground">
            Unified view of all client interactions
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{stats.messages}</div>
                <div className="text-xs text-muted-foreground">Messages</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{stats.emails}</div>
                <div className="text-xs text-muted-foreground">Emails</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">{stats.meetings}</div>
                <div className="text-xs text-muted-foreground">Meetings</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-orange-500" />
              <div>
                <div className="text-2xl font-bold">{stats.approvals}</div>
                <div className="text-xs text-muted-foreground">Approvals</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={stats.unreadMessages > 0 ? "border-green-300" : ""}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{stats.unreadMessages}</div>
                <div className="text-xs text-muted-foreground">Unread</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={stats.pendingApprovals > 0 ? "border-orange-300" : ""}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              <div>
                <div className="text-2xl font-bold">{stats.pendingApprovals}</div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clients.map(client => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.business_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={communicationType} onValueChange={setCommunicationType}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="message">Messages</SelectItem>
                <SelectItem value="email">Emails</SelectItem>
                <SelectItem value="meeting">Meetings</SelectItem>
                <SelectItem value="approval">Approvals</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search communications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Communication Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Communication Timeline</CardTitle>
          <CardDescription>
            Showing {allCommunications.length} communications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <div className="space-y-4">
              {allCommunications.map((comm, index) => (
                <div key={`${comm.type}-${comm.id}`} className="flex gap-4">
                  {/* Timeline line */}
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getTypeColor(comm.type)}`}>
                      {getTypeIcon(comm.type)}
                    </div>
                    {index < allCommunications.length - 1 && (
                      <div className="w-0.5 h-full bg-muted mt-2" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{comm.title}</span>
                          <Badge variant="secondary" className={`text-xs ${getTypeColor(comm.type)}`}>
                            {comm.type}
                          </Badge>
                          {comm.metadata?.is_read === false && comm.metadata?.sender_type === "client" && (
                            <Badge variant="default" className="text-xs">New</Badge>
                          )}
                        </div>
                        {comm.client_name && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                            <Building2 className="h-3 w-3" />
                            <span>{comm.client_name}</span>
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(comm.date), { addSuffix: true })}
                      </span>
                    </div>
                    
                    {comm.content && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                        {comm.content}
                      </p>
                    )}

                    {/* Type-specific metadata */}
                    {comm.type === "meeting" && (
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline">{comm.metadata?.meeting_type}</Badge>
                        <Badge variant="outline">{comm.metadata?.status}</Badge>
                      </div>
                    )}
                    {comm.type === "approval" && comm.metadata?.feedback && (
                      <div className="mt-2 p-2 bg-muted rounded text-sm">
                        <strong>Feedback:</strong> {comm.metadata.feedback}
                      </div>
                    )}
                    {comm.type === "email" && (
                      <Badge variant="outline" className="mt-2">
                        {comm.metadata?.status}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}