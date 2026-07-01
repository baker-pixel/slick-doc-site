import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Calendar as CalendarIcon, Plus, Clock, Trash2, Edit, Loader2,
  Mail, Linkedin, Facebook, Twitter, FileText, Sparkles, RefreshCw,
  CheckCircle, AlertCircle, Globe, Instagram, Zap
} from "lucide-react";
import { format, isSameDay, startOfDay } from "date-fns";

interface CalendarItem {
  id: string;
  content_id: string | null;
  client_account_id: string | null;
  title: string;
  content: string;
  content_type: string;
  scheduled_for: string;
  platform: string | null;
  status: string;
  published_at: string | null;
}

interface GeneratedContent {
  id: string;
  title: string | null;
  content: string;
  content_type: string;
}

interface ClientAccount {
  id: string;
  business_name: string;
  tier: string | null;
}

interface ContentApproval {
  id: string;
  title: string;
  content_type: string;
  status: string;
  publish_status: string | null;
  submitted_at: string;
}

export function ContentCalendarPanel() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent[]>([]);
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [filterClientId, setFilterClientId] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CalendarItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<ContentApproval[]>([]);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    content_id: "",
    client_account_id: "",
    title: "",
    content: "",
    content_type: "blog_post",
    scheduled_for: "",
    scheduled_time: "09:00",
    platform: "email"
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchApprovalsForClient(filterClientId);
  }, [filterClientId]);

  const fetchData = async () => {
    setIsLoading(true);
    const rangeStart = new Date();
    rangeStart.setDate(rangeStart.getDate() - 7);
    const rangeEnd = new Date();
    rangeEnd.setDate(rangeEnd.getDate() + 60);
    const [calendarRes, contentRes, clientsRes] = await Promise.all([
      supabase.from("content_calendar").select("*")
        .gte("scheduled_for", rangeStart.toISOString())
        .lte("scheduled_for", rangeEnd.toISOString())
        .order("scheduled_for", { ascending: true }),
      supabase.from("generated_content").select("id, title, content, content_type").eq("status", "published").order("created_at", { ascending: false }).limit(50),
      supabase.from("client_accounts").select("id, business_name, tier").eq("status", "active").order("business_name", { ascending: true })
    ]);

    if (calendarRes.data) setCalendarItems(calendarRes.data);
    if (contentRes.data) setGeneratedContent(contentRes.data);
    if (clientsRes.data) setClients(clientsRes.data);
    setIsLoading(false);
  };

  const fetchApprovalsForClient = async (clientId: string) => {
    if (clientId === "all") { setPendingApprovals([]); return; }
    const { data } = await supabase
      .from("content_approvals")
      .select("id, title, content_type, status, publish_status, submitted_at")
      .eq("client_account_id", clientId)
      .order("submitted_at", { ascending: false })
      .limit(10);
    setPendingApprovals(data || []);
  };

  const generateAIContent = async () => {
    if (filterClientId === "all") {
      toast({ title: "Select a client first", variant: "destructive" });
      return;
    }
    const client = clients.find(c => c.id === filterClientId);
    if (!client) return;
    const tier = client.tier || "foundation";

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("fill-scheduled-content", {
        body: { client_id: filterClientId, limit: 20 },
      });
      if (error) throw error;
      const filled = (data as any)?.successful ?? 0;
      toast({
        title: "Calendar filled",
        description: `${filled} slot${filled !== 1 ? "s" : ""} filled with AI content for ${client.business_name}.`,
      });
      fetchApprovalsForClient(filterClientId);
      fetchData();
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const seedCalendarSlots = async () => {
    if (filterClientId === "all") {
      toast({ title: "Select a client first", variant: "destructive" });
      return;
    }
    const client = clients.find(c => c.id === filterClientId);
    if (!client) return;
    const tier = client.tier || "foundation";

    setIsSeeding(true);
    try {
      const { data, error } = await supabase.functions.invoke("auto-schedule-content", {
        body: { client_id: filterClientId, tier },
      });
      if (error) throw error;
      toast({
        title: "Calendar seeded",
        description: `${(data as any)?.total_created ?? 0} slots added for ${client.business_name} (${tier} tier). Now click "Generate AI Content" to fill them.`,
      });
      fetchData();
    } catch (err: any) {
      toast({ title: "Seed failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSeeding(false);
    }
  };

  const openScheduleModal = (date?: Date) => {
    setEditingItem(null);
    setFormData({
      content_id: "",
      client_account_id: "",
      title: "",
      content: "",
      content_type: "blog_post",
      scheduled_for: date ? format(date, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
      scheduled_time: "09:00",
      platform: "email"
    });
    setScheduleModalOpen(true);
  };

  const openEditModal = (item: CalendarItem) => {
    setEditingItem(item);
    const date = new Date(item.scheduled_for);
    setFormData({
      content_id: item.content_id || "",
      client_account_id: item.client_account_id || "",
      title: item.title,
      content: item.content,
      content_type: item.content_type,
      scheduled_for: format(date, "yyyy-MM-dd"),
      scheduled_time: format(date, "HH:mm"),
      platform: item.platform || "email"
    });
    setScheduleModalOpen(true);
  };

  const handleContentSelect = (contentId: string) => {
    const selected = generatedContent.find(c => c.id === contentId);
    if (selected) {
      setFormData(prev => ({
        ...prev,
        content_id: contentId,
        title: selected.title || `Untitled ${selected.content_type}`,
        content: selected.content,
        content_type: selected.content_type
      }));
    }
  };

  const saveScheduledItem = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast({ title: "Please fill in title and content", variant: "destructive" });
      return;
    }
    if (!formData.client_account_id) {
      toast({ title: "Please select a client", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const scheduledDateTime = new Date(`${formData.scheduled_for}T${formData.scheduled_time}:00`);
      
      const itemData = {
        content_id: formData.content_id || null,
        client_account_id: formData.client_account_id,
        title: formData.title,
        content: formData.content,
        content_type: formData.content_type,
        scheduled_for: scheduledDateTime.toISOString(),
        platform: formData.platform,
        status: "scheduled",
        client_approved: true
      };

      if (editingItem) {
        const { error } = await supabase
          .from("content_calendar")
          .update(itemData)
          .eq("id", editingItem.id);
        if (error) throw error;
        toast({ title: "Schedule updated!" });
      } else {
        const { error } = await supabase
          .from("content_calendar")
          .insert(itemData);
        if (error) throw error;
        toast({ title: "Content scheduled!" });
      }

      setScheduleModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteScheduledItem = async (id: string) => {
    try {
      const { error } = await supabase.from("content_calendar").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Removed from calendar" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error deleting", description: error.message, variant: "destructive" });
    }
  };

  const PFM_PLATFORMS = new Set(["twitter", "facebook", "linkedin", "instagram"]);

  const handlePublishNow = async (item: CalendarItem) => {
    setPublishingId(item.id);
    try {
      const { data, error } = await supabase.functions.invoke("postforme-publish-post", {
        body: { contentCalendarId: item.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: "Published!",
        description: `"${item.title}" sent to ${item.platform}.`,
      });
      fetchData();
    } catch (err: any) {
      toast({ title: "Publish failed", description: err.message, variant: "destructive" });
    } finally {
      setPublishingId(null);
    }
  };

  const PLACEHOLDER_TEXT = "[Auto-generated placeholder — content will be created by AI]";
  const isPlaceholder = (item: CalendarItem) => item.content === PLACEHOLDER_TEXT || item.status === "draft";

  const getPlatformIcon = (platform: string | null) => {
    switch (platform) {
      case "email": return <Mail className="w-4 h-4" />;
      case "linkedin": return <Linkedin className="w-4 h-4" />;
      case "facebook": return <Facebook className="w-4 h-4" />;
      case "twitter": return <Twitter className="w-4 h-4" />;
      case "instagram": return <Instagram className="w-4 h-4" />;
      case "google_business": return <Globe className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };
  const getClientName = (clientId: string | null) => {
    if (!clientId) return "No client";
    return clients.find(c => c.id === clientId)?.business_name || "Unknown";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "published": return "bg-green-600";
      case "failed": return "bg-destructive";
      case "draft": return "bg-muted text-muted-foreground border";
      default: return "bg-blue-600";
    }
  };

  const filteredItems = filterClientId === "all"
    ? calendarItems
    : calendarItems.filter(item => item.client_account_id === filterClientId);

  const getItemsForDate = (date: Date) => {
    return filteredItems.filter(item => 
      isSameDay(new Date(item.scheduled_for), date)
    );
  };

  const datesWithContent = filteredItems.map(item => 
    startOfDay(new Date(item.scheduled_for)).getTime()
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedDateItems = selectedDate ? getItemsForDate(selectedDate) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-primary" />
          Content Calendar
        </h2>
        <div className="flex items-center gap-3">
          <Select value={filterClientId} onValueChange={setFilterClientId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filterClientId !== "all" && (
            <>
              <Button
                variant="outline"
                onClick={seedCalendarSlots}
                disabled={isSeeding}
                title="Seed calendar with scheduled slots based on client tier"
              >
                {isSeeding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CalendarIcon className="w-4 h-4 mr-2" />}
                Seed Slots
              </Button>
              <Button
                variant="outline"
                onClick={generateAIContent}
                disabled={isGenerating}
                title="Generate AI content and queue for approval"
              >
                {isGenerating ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Generate AI Content
              </Button>
            </>
          )}
          <Button onClick={() => openScheduleModal(selectedDate)}>
            <Plus className="w-4 h-4 mr-2" /> Schedule Content
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Calendar View */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select Date</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="rounded-md border"
              modifiers={{
                hasContent: (date) => datesWithContent.includes(startOfDay(date).getTime())
              }}
              modifiersStyles={{
                hasContent: { 
                  backgroundColor: "hsl(var(--primary) / 0.2)",
                  fontWeight: "bold"
                }
              }}
            />
          </CardContent>
        </Card>

        {/* Selected Date Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selectedDate ? format(selectedDate, "MMMM d, yyyy") : "Select a date"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedDateItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No content scheduled</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-3"
                  onClick={() => openScheduleModal(selectedDate)}
                >
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedDateItems.map(item => (
                  <div 
                    key={item.id} 
                    className="p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getPlatformIcon(item.platform)}
                          <span className="font-medium truncate">{item.title}</span>
                          <Badge className={`text-xs ${getStatusColor(item.status)}`}>
                            {item.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(item.scheduled_for), "h:mm a")} · {getClientName(item.client_account_id)}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {isPlaceholder(item)
                            ? "Pending AI generation — click \"Generate AI Content\" to fill"
                            : item.content.length > 100
                              ? item.content.substring(0, 100) + "..."
                              : item.content}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {item.status === "scheduled" && PFM_PLATFORMS.has(item.platform || "") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                            title="Publish now via Post for Me"
                            disabled={publishingId === item.id}
                            onClick={() => handlePublishNow(item)}
                          >
                            {publishingId === item.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Zap className="w-4 h-4" />}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditModal(item)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteScheduledItem(item.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pending Approvals for selected client */}
      {filterClientId !== "all" && pendingApprovals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Content Awaiting Approval ({pendingApprovals.filter(a => a.status === "pending").length} pending)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingApprovals.map(a => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="font-medium text-sm">{a.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.content_type.replace(/_/g, " ")} · {format(new Date(a.submitted_at), "MMM d, h:mm a")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.status === "pending" && (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200">Needs Admin Review</Badge>
                    )}
                    {a.status === "approved" && a.publish_status === "queued" && (
                      <Badge className="bg-blue-100 text-blue-800 border-blue-200">Publishing...</Badge>
                    )}
                    {a.status === "approved" && a.publish_status === "published" && (
                      <Badge className="bg-green-100 text-green-800 border-green-200">
                        <CheckCircle className="w-3 h-3 mr-1" /> Published
                      </Badge>
                    )}
                    {a.status === "changes_requested" && (
                      <Badge className="bg-orange-100 text-orange-800 border-orange-200">Changes Requested</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming Scheduled Content</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredItems.filter(i => i.status === "scheduled" && !isPlaceholder(i) && new Date(i.scheduled_for) >= new Date()).length === 0 ? (
            <p className="text-center py-4 text-muted-foreground">No upcoming content scheduled</p>
          ) : (
            <div className="space-y-2">
              {filteredItems
                .filter(i => i.status === "scheduled" && !isPlaceholder(i) && new Date(i.scheduled_for) >= new Date())
                .slice(0, 10)
                .map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {getPlatformIcon(item.platform)}
                      <div>
                        <p className="font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(item.scheduled_for), "MMM d, yyyy 'at' h:mm a")} · {getClientName(item.client_account_id)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{item.content_type.replace(/_/g, " ")}</Badge>
                      {PFM_PLATFORMS.has(item.platform || "") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                          title="Publish now via Post for Me"
                          disabled={publishingId === item.id}
                          onClick={() => handlePublishNow(item)}
                        >
                          {publishingId === item.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Zap className="w-4 h-4" />}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditModal(item)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedule/Edit Modal */}
      <Dialog open={scheduleModalOpen} onOpenChange={setScheduleModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Scheduled Content" : "Schedule Content"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Use existing content */}
            {generatedContent.length > 0 && !editingItem && (
              <div className="space-y-2">
                <Label>Use Published Content (Optional)</Label>
                <Select value={formData.content_id} onValueChange={handleContentSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select existing content..." />
                  </SelectTrigger>
                  <SelectContent>
                    {generatedContent.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title || `Untitled ${c.content_type}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Client *</Label>
              <Select 
                value={formData.client_account_id} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, client_account_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.business_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Input
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Content title..."
              />
            </div>

            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                placeholder="Content body..."
                className="min-h-[100px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Platform</Label>
                <Select 
                  value={formData.platform} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, platform: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="twitter">Twitter/X</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="blog">Blog</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Content Type</Label>
                <Select 
                  value={formData.content_type} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, content_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blog_post">Blog Post</SelectItem>
                    <SelectItem value="social_post">Social Post</SelectItem>
                    <SelectItem value="email_copy">Email Copy</SelectItem>
                    <SelectItem value="ad_copy">Ad Copy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={formData.scheduled_for}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduled_for: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={formData.scheduled_time}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduled_time: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveScheduledItem} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingItem ? "Update" : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}