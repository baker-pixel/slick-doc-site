import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { motion } from "framer-motion";
import { Loader2, Calendar as CalendarIcon, Clock, Video, Phone, Plus, X, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, addDays, isBefore, isToday, startOfDay, setHours, setMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { PageHeader, StatCard, ModernCard, EmptyState, StatusBadge } from "./PortalUI";

interface Meeting {
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
}

interface ClientMeetingsTabProps {
  clientAccountId: string;
  clientName?: string;
}

const meetingTypes = [
  { value: "call", label: "Phone Call", icon: Phone },
  { value: "video", label: "Video Call", icon: Video },
];

const timeSlots = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00"
];

const durations = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "1 hour" },
];

export default function ClientMeetingsTab({ clientAccountId, clientName }: ClientMeetingsTabProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [booking, setBooking] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("video");
  const [selectedDuration, setSelectedDuration] = useState<number>(30);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    fetchMeetings();
    const channel = supabase
      .channel('client-meetings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_meetings', filter: `client_account_id=eq.${clientAccountId}` }, () => fetchMeetings())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientAccountId]);

  const fetchMeetings = async () => {
    try {
      const { data, error } = await supabase
        .from("client_meetings")
        .select("*")
        .eq("client_account_id", clientAccountId)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      setMeetings((data || []) as Meeting[]);
    } catch (error) {
      console.error("Error fetching meetings:", error);
      toast({ title: "Error", description: "Failed to load meetings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleBookMeeting = async () => {
    if (!selectedDate || !selectedTime || !title.trim()) {
      toast({ title: "Missing information", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    setBooking(true);
    try {
      const [hours, minutes] = selectedTime.split(":").map(Number);
      const scheduledAt = setMinutes(setHours(selectedDate, hours), minutes);

      const { error } = await supabase.from("client_meetings").insert({
        client_account_id: clientAccountId,
        title: title.trim(),
        description: description.trim() || null,
        meeting_type: selectedType,
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: selectedDuration,
        booked_by: clientName || "Client",
      });

      if (error) throw error;
      toast({ title: "Meeting booked", description: `Your ${selectedType === "video" ? "video call" : "phone call"} has been scheduled` });
      setSelectedDate(undefined);
      setSelectedTime("");
      setTitle("");
      setDescription("");
      setIsBookingOpen(false);
    } catch (error) {
      console.error("Error booking meeting:", error);
      toast({ title: "Booking failed", description: "Failed to schedule meeting. Please try again.", variant: "destructive" });
    } finally {
      setBooking(false);
    }
  };

  const handleCancelMeeting = async (meetingId: string) => {
    try {
      const { error } = await supabase.from("client_meetings").update({ status: "cancelled" }).eq("id", meetingId);
      if (error) throw error;
      toast({ title: "Meeting cancelled", description: "The meeting has been cancelled" });
    } catch (error) {
      console.error("Error cancelling meeting:", error);
      toast({ title: "Error", description: "Failed to cancel meeting", variant: "destructive" });
    }
  };

  const getStatusConfig = (status: string, scheduledAt: string) => {
    const meetingDate = new Date(scheduledAt);
    const isPast = isBefore(meetingDate, new Date()) && status === "scheduled";
    if (status === "cancelled") return { label: "Cancelled", variant: "error" as const };
    if (status === "completed" || isPast) return { label: "Completed", variant: "default" as const };
    if (isToday(meetingDate)) return { label: "Today", variant: "success" as const };
    return { label: "Upcoming", variant: "info" as const };
  };

  const upcomingMeetings = meetings.filter((m) => m.status === "scheduled" && !isBefore(new Date(m.scheduled_at), startOfDay(new Date())));
  const pastMeetings = meetings.filter((m) => m.status !== "scheduled" || isBefore(new Date(m.scheduled_at), startOfDay(new Date())));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
            <Loader2 className="h-7 w-7 text-primary-foreground animate-spin" />
          </div>
          <p className="text-muted-foreground">Loading meetings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader 
        title="Meetings" 
        description="Schedule and manage your calls with the team"
        icon={CalendarIcon}
        action={
          <Dialog open={isBookingOpen} onOpenChange={setIsBookingOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/20">
                <Plus className="h-4 w-4 mr-2" />
                Schedule Meeting
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Schedule a Meeting</DialogTitle>
                <DialogDescription>Book a call with your agency team</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Meeting Title *</Label>
                  <Input placeholder="e.g., Monthly Review" value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-xl" />
                </div>

                <div className="space-y-2">
                  <Label>Meeting Type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {meetingTypes.map((type) => (
                      <Button
                        key={type.value}
                        type="button"
                        variant={selectedType === type.value ? "default" : "outline"}
                        onClick={() => setSelectedType(type.value)}
                        className={cn("justify-start rounded-xl", selectedType === type.value && "bg-gradient-to-r from-primary to-primary/80")}
                      >
                        <type.icon className="h-4 w-4 mr-2" />
                        {type.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Select Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start rounded-xl", !selectedDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        disabled={(date) => isBefore(date, startOfDay(new Date())) || isBefore(addDays(new Date(), 60), date)}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Time *</Label>
                    <Select value={selectedTime} onValueChange={setSelectedTime}>
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Time" /></SelectTrigger>
                      <SelectContent>{timeSlots.map((time) => <SelectItem key={time} value={time}>{time}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Duration</Label>
                    <Select value={selectedDuration.toString()} onValueChange={(v) => setSelectedDuration(Number(v))}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>{durations.map((d) => <SelectItem key={d.value} value={d.value.toString()}>{d.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Textarea placeholder="What would you like to discuss?" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="rounded-xl" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsBookingOpen(false)} className="rounded-xl">Cancel</Button>
                <Button onClick={handleBookMeeting} disabled={booking || !selectedDate || !selectedTime || !title.trim()} className="rounded-xl bg-gradient-to-r from-primary to-primary/80">
                  {booking ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Booking...</> : "Book Meeting"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Upcoming" value={upcomingMeetings.length} icon={CalendarIcon} index={0} />
        <StatCard label="Next Meeting" value={upcomingMeetings.length > 0 ? format(new Date(upcomingMeetings[0].scheduled_at), "MMM d") : "None"} icon={Clock} index={1} />
        <StatCard label="Total Meetings" value={meetings.length} icon={Video} index={2} />
      </div>

      {/* Upcoming Meetings */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Upcoming Meetings</h3>
        {upcomingMeetings.length === 0 ? (
          <EmptyState icon={CalendarIcon} title="No upcoming meetings" description="Schedule a meeting to connect with your agency team" />
        ) : (
          <div className="space-y-4">
            {upcomingMeetings.map((meeting, index) => {
              const statusConfig = getStatusConfig(meeting.status, meeting.scheduled_at);
              return (
                <motion.div key={meeting.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}>
                  <ModernCard className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10">
                          {meeting.meeting_type === "video" ? <Video className="h-6 w-6 text-primary" /> : <Phone className="h-6 w-6 text-primary" />}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h4 className="font-semibold text-foreground">{meeting.title}</h4>
                            <StatusBadge status={statusConfig.label} variant={statusConfig.variant} />
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1.5"><CalendarIcon className="h-4 w-4" />{format(new Date(meeting.scheduled_at), "EEEE, MMMM d, yyyy")}</span>
                            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{format(new Date(meeting.scheduled_at), "h:mm a")} ({meeting.duration_minutes} min)</span>
                          </div>
                          {meeting.description && <p className="text-sm text-muted-foreground">{meeting.description}</p>}
                          {meeting.meeting_link && (
                            <a href={meeting.meeting_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-primary font-medium hover:underline">
                              <ExternalLink className="h-4 w-4" />Join Meeting
                            </a>
                          )}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleCancelMeeting(meeting.id)} className="text-destructive hover:bg-destructive/10 rounded-xl" aria-label="Cancel meeting">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </ModernCard>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Past Meetings */}
      {pastMeetings.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">Past Meetings</h3>
          <div className="space-y-3">
            {pastMeetings.slice(0, 5).map((meeting, index) => {
              const statusConfig = getStatusConfig(meeting.status, meeting.scheduled_at);
              return (
                <motion.div key={meeting.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.05 }}>
                  <ModernCard className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-muted/50">
                          {meeting.meeting_type === "video" ? <Video className="h-4 w-4 text-muted-foreground" /> : <Phone className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <div>
                          <p className="font-medium text-foreground text-sm">{meeting.title}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(meeting.scheduled_at), "MMM d, yyyy 'at' h:mm a")}</p>
                        </div>
                      </div>
                      <StatusBadge status={statusConfig.label} variant={statusConfig.variant} />
                    </div>
                  </ModernCard>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
