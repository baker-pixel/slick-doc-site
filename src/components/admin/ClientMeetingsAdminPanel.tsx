import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Calendar, Clock, Link as LinkIcon, RefreshCw, Video, Phone, Users, Search, Edit2, ExternalLink, Plus, Loader2 } from "lucide-react";

interface ClientMeeting {
  id: string;
  client_account_id: string;
  title: string;
  description: string | null;
  meeting_type: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  meeting_link: string | null;
  notes: string | null;
  booked_by: string | null;
  created_at: string;
  client_accounts?: {
    business_name: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  };
}

interface ClientAccount {
  id: string;
  business_name: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

const ClientMeetingsAdminPanel = () => {
  const [meetings, setMeetings] = useState<ClientMeeting[]>([]);
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingMeeting, setEditingMeeting] = useState<ClientMeeting | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editForm, setEditForm] = useState({
    status: "",
    meeting_link: "",
    notes: ""
  });
  const [createForm, setCreateForm] = useState({
    client_account_id: "",
    title: "",
    description: "",
    meeting_type: "video",
    scheduled_date: "",
    scheduled_time: "",
    duration_minutes: "30",
    meeting_link: "",
    notes: ""
  });

  useEffect(() => {
    fetchMeetings();
    fetchClients();
    
    const channel = supabase
      .channel('admin-meetings-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_meetings' }, () => {
        fetchMeetings();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('client_accounts')
        .select('id, business_name, email, first_name, last_name')
        .order('business_name');
      
      if (error) throw error;
      setClients(data || []);
    } catch (error: any) {
      console.error("Error fetching clients:", error);
    }
  };

  const fetchMeetings = async () => {
    try {
      const { data, error } = await supabase
        .from('client_meetings')
        .select(`
          *,
          client_accounts (
            business_name,
            email,
            first_name,
            last_name
          )
        `)
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      setMeetings(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching meetings",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (meeting: ClientMeeting) => {
    setEditingMeeting(meeting);
    setEditForm({
      status: meeting.status,
      meeting_link: meeting.meeting_link || "",
      notes: meeting.notes || ""
    });
    setEditDialogOpen(true);
  };

  const handleUpdateMeeting = async () => {
    if (!editingMeeting) return;

    try {
      const { error } = await supabase
        .from('client_meetings')
        .update({
          status: editForm.status,
          meeting_link: editForm.meeting_link || null,
          notes: editForm.notes || null
        })
        .eq('id', editingMeeting.id);

      if (error) throw error;

      toast({ title: "Meeting updated successfully" });
      setEditDialogOpen(false);
      setEditingMeeting(null);
      fetchMeetings();
    } catch (error: any) {
      toast({
        title: "Error updating meeting",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleCreateMeeting = async () => {
    if (!createForm.client_account_id || !createForm.title || !createForm.scheduled_date || !createForm.scheduled_time) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    setIsCreating(true);
    try {
      const scheduledAt = new Date(`${createForm.scheduled_date}T${createForm.scheduled_time}`).toISOString();
      
      const { error } = await supabase
        .from('client_meetings')
        .insert({
          client_account_id: createForm.client_account_id,
          title: createForm.title,
          description: createForm.description || null,
          meeting_type: createForm.meeting_type,
          scheduled_at: scheduledAt,
          duration_minutes: parseInt(createForm.duration_minutes),
          meeting_link: createForm.meeting_link || null,
          notes: createForm.notes || null,
          status: 'scheduled',
          booked_by: 'Admin'
        });

      if (error) throw error;

      toast({ title: "Meeting created successfully" });
      setCreateDialogOpen(false);
      setCreateForm({
        client_account_id: "",
        title: "",
        description: "",
        meeting_type: "video",
        scheduled_date: "",
        scheduled_time: "",
        duration_minutes: "30",
        meeting_link: "",
        notes: ""
      });
      fetchMeetings();
    } catch (error: any) {
      toast({
        title: "Error creating meeting",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-500/10 text-blue-500';
      case 'completed': return 'bg-green-500/10 text-green-500';
      case 'cancelled': return 'bg-red-500/10 text-red-500';
      case 'rescheduled': return 'bg-yellow-500/10 text-yellow-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getMeetingTypeIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video className="h-4 w-4" />;
      case 'phone': return <Phone className="h-4 w-4" />;
      case 'in_person': return <Users className="h-4 w-4" />;
      default: return <Calendar className="h-4 w-4" />;
    }
  };

  const filteredMeetings = meetings.filter(meeting => {
    const matchesSearch = searchTerm === "" ||
      meeting.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      meeting.client_accounts?.business_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      meeting.client_accounts?.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || meeting.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const upcomingCount = meetings.filter(m => m.status === 'scheduled' && new Date(m.scheduled_at) >= new Date()).length;
  const todayCount = meetings.filter(m => {
    const meetingDate = new Date(m.scheduled_at);
    const today = new Date();
    return meetingDate.toDateString() === today.toDateString() && m.status === 'scheduled';
  }).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Client Meetings
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {upcomingCount} upcoming · {todayCount} today
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setCreateDialogOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Schedule Meeting
            </Button>
            <Button onClick={fetchMeetings} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="rescheduled">Rescheduled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading meetings...</div>
        ) : filteredMeetings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No meetings found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Meeting</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMeetings.map((meeting) => {
                  const clientName = [meeting.client_accounts?.first_name, meeting.client_accounts?.last_name].filter(Boolean).join(' ');
                  return (
                  <TableRow key={meeting.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{meeting.client_accounts?.business_name}</p>
                        {clientName && <p className="text-xs text-muted-foreground">{clientName}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm">{meeting.client_accounts?.email}</p>
                        {meeting.booked_by && (
                          <p className="text-xs text-muted-foreground">Booked by: {meeting.booked_by}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{meeting.title}</p>
                        {meeting.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">{meeting.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{format(new Date(meeting.scheduled_at), 'MMM d, yyyy')}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(meeting.scheduled_at), 'h:mm a')} ({meeting.duration_minutes}min)
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 capitalize">
                        {getMeetingTypeIcon(meeting.meeting_type)}
                        <span className="text-sm">{meeting.meeting_type.replace('_', ' ')}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(meeting.status)}>
                        {meeting.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {meeting.meeting_link ? (
                        <a 
                          href={meeting.meeting_link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline text-sm"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Join
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">No link</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => openEditDialog(meeting)}
                        title="Edit meeting"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Meeting</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {editingMeeting && (
                <div className="bg-muted p-3 rounded-lg mb-4">
                  <p className="font-medium">{editingMeeting.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {editingMeeting.client_accounts?.business_name} · {format(new Date(editingMeeting.scheduled_at), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
              )}
              
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={(value) => setEditForm({ ...editForm, status: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="rescheduled">Rescheduled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Meeting Link</Label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="https://zoom.us/j/..."
                    value={editForm.meeting_link}
                    onChange={(e) => setEditForm({ ...editForm, meeting_link: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Add meeting notes..."
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateMeeting}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Meeting Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Schedule New Meeting
              </DialogTitle>
              <DialogDescription>
                Create a new meeting with a client
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Client *</Label>
                <Select 
                  value={createForm.client_account_id} 
                  onValueChange={(value) => setCreateForm({ ...createForm, client_account_id: value })}
                >
                  <SelectTrigger>
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
              </div>

              <div className="space-y-2">
                <Label>Meeting Title *</Label>
                <Input
                  placeholder="e.g., Bi-Weekly Strategy Call"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Meeting agenda or description..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    value={createForm.scheduled_date}
                    onChange={(e) => setCreateForm({ ...createForm, scheduled_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Time *</Label>
                  <Input
                    type="time"
                    value={createForm.scheduled_time}
                    onChange={(e) => setCreateForm({ ...createForm, scheduled_time: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Meeting Type</Label>
                  <Select 
                    value={createForm.meeting_type} 
                    onValueChange={(value) => setCreateForm({ ...createForm, meeting_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="video">
                        <div className="flex items-center gap-2">
                          <Video className="h-4 w-4" /> Video Call
                        </div>
                      </SelectItem>
                      <SelectItem value="phone">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" /> Phone Call
                        </div>
                      </SelectItem>
                      <SelectItem value="in_person">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" /> In Person
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Duration</Label>
                  <Select 
                    value={createForm.duration_minutes} 
                    onValueChange={(value) => setCreateForm({ ...createForm, duration_minutes: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="90">1.5 hours</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Meeting Link</Label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="https://zoom.us/j/... or https://meet.google.com/..."
                    value={createForm.meeting_link}
                    onChange={(e) => setCreateForm({ ...createForm, meeting_link: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Any additional notes..."
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={isCreating}>
                Cancel
              </Button>
              <Button onClick={handleCreateMeeting} disabled={isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Schedule Meeting
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default ClientMeetingsAdminPanel;
