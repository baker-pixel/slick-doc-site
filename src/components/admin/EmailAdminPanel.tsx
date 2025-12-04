import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, Search, Mail, Clock, CheckCircle, XCircle, Eye, Plus, Edit2, Trash2, Send } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

interface EmailQueueItem {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  html_content: string;
  status: string;
  scheduled_for: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  metadata: Json;
}

interface EmailLog {
  id: string;
  recipient_email: string;
  subject: string;
  status: string;
  sent_at: string;
  resend_id: string | null;
  metadata: Json;
}

interface EmailSequence {
  id: string;
  name: string;
  trigger_type: string;
  is_active: boolean;
  emails: Json;
  created_at: string;
  updated_at: string;
}

interface EmailAdminPanelProps {
  password: string;
}

export const EmailAdminPanel = ({ password }: EmailAdminPanelProps) => {
  const [emailQueue, setEmailQueue] = useState<EmailQueueItem[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [sequences, setSequences] = useState<EmailSequence[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [queueSearch, setQueueSearch] = useState("");
  const [queueStatusFilter, setQueueStatusFilter] = useState("all");
  const [logSearch, setLogSearch] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<EmailQueueItem | EmailLog | null>(null);
  const [selectedSequence, setSelectedSequence] = useState<EmailSequence | null>(null);
  const [isSequenceDialogOpen, setIsSequenceDialogOpen] = useState(false);

  const fetchEmailData = async () => {
    setIsLoading(true);
    try {
      const response = await supabase.functions.invoke("admin", {
        body: { action: "list", table: "email_queue", password },
      });
      if (response.data?.data) {
        setEmailQueue(response.data.data);
      }

      const logsResponse = await supabase.functions.invoke("admin", {
        body: { action: "list", table: "email_logs", password },
      });
      if (logsResponse.data?.data) {
        setEmailLogs(logsResponse.data.data);
      }

      const seqResponse = await supabase.functions.invoke("admin", {
        body: { action: "list", table: "email_sequences", password },
      });
      if (seqResponse.data?.data) {
        setSequences(seqResponse.data.data);
      }
    } catch (error) {
      console.error("Error fetching email data:", error);
      toast({
        title: "Error",
        description: "Failed to fetch email data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEmailData();
  }, [password]);

  const filteredQueue = useMemo(() => {
    return emailQueue.filter((item) => {
      const matchesSearch =
        queueSearch === "" ||
        item.recipient_email.toLowerCase().includes(queueSearch.toLowerCase()) ||
        item.subject.toLowerCase().includes(queueSearch.toLowerCase());
      const matchesStatus = queueStatusFilter === "all" || item.status === queueStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [emailQueue, queueSearch, queueStatusFilter]);

  const filteredLogs = useMemo(() => {
    return emailLogs.filter((item) => {
      return (
        logSearch === "" ||
        item.recipient_email.toLowerCase().includes(logSearch.toLowerCase()) ||
        item.subject.toLowerCase().includes(logSearch.toLowerCase())
      );
    });
  }, [emailLogs, logSearch]);

  const handleToggleSequence = async (sequence: EmailSequence) => {
    try {
      await supabase.functions.invoke("admin", {
        body: {
          action: "update",
          table: "email_sequences",
          id: sequence.id,
          data: { is_active: !sequence.is_active },
          password,
        },
      });
      toast({
        title: "Success",
        description: `Sequence ${sequence.is_active ? "disabled" : "enabled"}`,
      });
      fetchEmailData();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update sequence",
        variant: "destructive",
      });
    }
  };

  const handleDeleteQueueItem = async (id: string) => {
    try {
      await supabase.functions.invoke("admin", {
        body: { action: "delete", table: "email_queue", id, password },
      });
      toast({ title: "Success", description: "Email removed from queue" });
      fetchEmailData();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete email",
        variant: "destructive",
      });
    }
  };

  const handleProcessQueue = async () => {
    try {
      setIsLoading(true);
      await supabase.functions.invoke("process-email-queue");
      toast({ title: "Success", description: "Email queue processed" });
      fetchEmailData();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process queue",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Sent</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pending</Badge>;
      case "failed":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Failed</Badge>;
      case "scheduled":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Scheduled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const queueStats = useMemo(() => {
    const pending = emailQueue.filter((e) => e.status === "pending").length;
    const scheduled = emailQueue.filter((e) => e.status === "scheduled").length;
    const failed = emailQueue.filter((e) => e.status === "failed").length;
    const sent = emailLogs.length;
    return { pending, scheduled, failed, sent };
  }, [emailQueue, emailLogs]);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/20">
                <Clock className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{queueStats.pending}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Mail className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{queueStats.scheduled}</p>
                <p className="text-sm text-muted-foreground">Scheduled</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{queueStats.sent}</p>
                <p className="text-sm text-muted-foreground">Sent</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <XCircle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{queueStats.failed}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="queue" className="w-full">
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="queue">Email Queue</TabsTrigger>
          <TabsTrigger value="sent">Sent Emails</TabsTrigger>
          <TabsTrigger value="sequences">Sequences</TabsTrigger>
        </TabsList>

        {/* Email Queue Tab */}
        <TabsContent value="queue" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-4">
              <div className="flex flex-col md:flex-row gap-4 justify-between">
                <div className="flex gap-2 flex-1">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search emails..."
                      value={queueSearch}
                      onChange={(e) => setQueueSearch(e.target.value)}
                      className="pl-9 bg-background/50"
                    />
                  </div>
                  <Select value={queueStatusFilter} onValueChange={setQueueStatusFilter}>
                    <SelectTrigger className="w-32 bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={fetchEmailData} disabled={isLoading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                  <Button size="sm" onClick={handleProcessQueue} disabled={isLoading}>
                    <Send className="w-4 h-4 mr-2" />
                    Process Queue
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQueue.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No emails in queue
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredQueue.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-foreground">{item.recipient_name || "—"}</p>
                              <p className="text-sm text-muted-foreground">{item.recipient_email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{item.subject}</TableCell>
                          <TableCell>{getStatusBadge(item.status)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(item.scheduled_for), "MMM d, h:mm a")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setSelectedEmail(item)}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                  <DialogHeader>
                                    <DialogTitle>Email Preview</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div>
                                      <p className="text-sm text-muted-foreground">To</p>
                                      <p className="font-medium">{item.recipient_email}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground">Subject</p>
                                      <p className="font-medium">{item.subject}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground mb-2">Content</p>
                                      <div
                                        className="border rounded-lg p-4 bg-background"
                                        dangerouslySetInnerHTML={{ __html: item.html_content }}
                                      />
                                    </div>
                                    {item.error_message && (
                                      <div>
                                        <p className="text-sm text-red-400">Error</p>
                                        <p className="text-red-300">{item.error_message}</p>
                                      </div>
                                    )}
                                  </div>
                                </DialogContent>
                              </Dialog>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteQueueItem(item.id)}
                              >
                                <Trash2 className="w-4 h-4 text-red-400" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sent Emails Tab */}
        <TabsContent value="sent" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-4">
              <div className="flex gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search sent emails..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="pl-9 bg-background/50"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={fetchEmailData} disabled={isLoading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead>Resend ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No sent emails
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLogs.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.recipient_email}</TableCell>
                          <TableCell className="max-w-xs truncate">{item.subject}</TableCell>
                          <TableCell>{getStatusBadge(item.status)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(item.sent_at), "MMM d, h:mm a")}
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">
                            {item.resend_id || "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sequences Tab */}
        <TabsContent value="sequences" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Email Sequences</CardTitle>
                <Button variant="outline" size="sm" onClick={fetchEmailData} disabled={isLoading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {sequences.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No sequences configured</p>
                ) : (
                  sequences.map((sequence) => {
                    const emails = Array.isArray(sequence.emails) ? sequence.emails : [];
                    return (
                      <Card key={sequence.id} className="bg-background/50 border-border/30">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-foreground">{sequence.name}</h3>
                                <Badge variant="outline" className="text-xs">
                                  {sequence.trigger_type}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {emails.length} email{emails.length !== 1 ? "s" : ""} in sequence
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">
                                  {sequence.is_active ? "Active" : "Inactive"}
                                </span>
                                <Switch
                                  checked={sequence.is_active}
                                  onCheckedChange={() => handleToggleSequence(sequence)}
                                />
                              </div>
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setSelectedSequence(sequence)}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                  <DialogHeader>
                                    <DialogTitle>{sequence.name}</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div>
                                      <p className="text-sm text-muted-foreground">Trigger</p>
                                      <Badge variant="outline">{sequence.trigger_type}</Badge>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground mb-2">Emails in Sequence</p>
                                      <div className="space-y-3">
                                        {emails.map((email: any, index: number) => (
                                          <Card key={index} className="bg-muted/30">
                                            <CardContent className="p-3">
                                              <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs text-muted-foreground">
                                                  Email {index + 1}
                                                </span>
                                                <Badge variant="secondary" className="text-xs">
                                                  +{email.delay_hours || 0}h delay
                                                </Badge>
                                              </div>
                                              <p className="font-medium text-sm">{email.subject}</p>
                                            </CardContent>
                                          </Card>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
