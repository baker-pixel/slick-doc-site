import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Calendar as CalendarIcon, Clock, Video, Phone, Plus, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, addDays, isBefore, isToday, startOfDay, setHours, setMinutes } from "date-fns";
import { cn } from "@/lib/utils";

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

  // Booking form state
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_meetings',
          filter: `client_account_id=eq.${clientAccountId}`,
        },
        () => {
          console.log('Meetings updated, refreshing...');
          fetchMeetings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
      toast({
        title: "Error",
        description: "Failed to load meetings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBookMeeting = async () => {
    if (!selectedDate || !selectedTime || !title.trim()) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
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

      toast({
        title: "Meeting booked",
        description: `Your ${selectedType === "video" ? "video call" : "phone call"} has been scheduled`,
      });

      // Reset form
      setSelectedDate(undefined);
      setSelectedTime("");
      setTitle("");
      setDescription("");
      setIsBookingOpen(false);
    } catch (error) {
      console.error("Error booking meeting:", error);
      toast({
        title: "Booking failed",
        description: "Failed to schedule meeting. Please try again.",
        variant: "destructive",
      });
    } finally {
      setBooking(false);
    }
  };

  const handleCancelMeeting = async (meetingId: string) => {
    try {
      const { error } = await supabase
        .from("client_meetings")
        .update({ status: "cancelled" })
        .eq("id", meetingId);

      if (error) throw error;

      toast({
        title: "Meeting cancelled",
        description: "The meeting has been cancelled",
      });
    } catch (error) {
      console.error("Error cancelling meeting:", error);
      toast({
        title: "Error",
        description: "Failed to cancel meeting",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string, scheduledAt: string) => {
    const meetingDate = new Date(scheduledAt);
    const isPast = isBefore(meetingDate, new Date()) && status === "scheduled";

    if (status === "cancelled") {
      return <Badge variant="destructive">Cancelled</Badge>;
    }
    if (status === "completed" || isPast) {
      return <Badge variant="secondary">Completed</Badge>;
    }
    if (isToday(meetingDate)) {
      return <Badge className="bg-green-500/10 text-green-600">Today</Badge>;
    }
    return <Badge className="bg-blue-500/10 text-blue-600">Upcoming</Badge>;
  };

  const upcomingMeetings = meetings.filter(
    (m) => m.status === "scheduled" && !isBefore(new Date(m.scheduled_at), startOfDay(new Date()))
  );
  const pastMeetings = meetings.filter(
    (m) => m.status !== "scheduled" || isBefore(new Date(m.scheduled_at), startOfDay(new Date()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming Meetings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{upcomingMeetings.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Next Meeting</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {upcomingMeetings.length > 0
                ? format(new Date(upcomingMeetings[0].scheduled_at), "MMM d")
                : "None"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Meetings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{meetings.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Book Meeting Button */}
      <Dialog open={isBookingOpen} onOpenChange={setIsBookingOpen}>
        <DialogTrigger asChild>
          <Button size="lg" className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Schedule a Meeting
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule a Meeting</DialogTitle>
            <DialogDescription>
              Book a call with your agency team
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Meeting Title *</Label>
              <Input
                placeholder="e.g., Monthly Review, Strategy Discussion"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
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
                    className="justify-start"
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
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
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

            <div className="space-y-2">
              <Label>Select Time *</Label>
              <Select value={selectedTime} onValueChange={setSelectedTime}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a time slot" />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={selectedDuration.toString()} onValueChange={(v) => setSelectedDuration(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {durations.map((d) => (
                    <SelectItem key={d.value} value={d.value.toString()}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="What would you like to discuss?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBookingOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBookMeeting} disabled={booking || !selectedDate || !selectedTime || !title.trim()}>
              {booking ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Booking...
                </>
              ) : (
                "Book Meeting"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upcoming Meetings */}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Meetings</CardTitle>
          <CardDescription>Your scheduled calls with the agency team</CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingMeetings.length === 0 ? (
            <div className="text-center py-8">
              <CalendarIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No upcoming meetings</h3>
              <p className="text-sm text-muted-foreground">
                Schedule a meeting to connect with your agency team
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingMeetings.map((meeting) => (
                <div
                  key={meeting.id}
                  className="flex items-start justify-between p-4 rounded-lg border bg-card"
                >
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      {meeting.meeting_type === "video" ? (
                        <Video className="h-6 w-6 text-primary" />
                      ) : meeting.meeting_type === "kickoff" ? (
                        <CalendarIcon className="h-6 w-6 text-primary" />
                      ) : (
                        <Phone className="h-6 w-6 text-primary" />
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium">{meeting.title}</h4>
                        {getStatusBadge(meeting.status, meeting.scheduled_at)}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="h-3.5 w-3.5" />
                          {format(new Date(meeting.scheduled_at), "EEEE, MMMM d, yyyy")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {format(new Date(meeting.scheduled_at), "h:mm a")} ({meeting.duration_minutes} min)
                        </span>
                      </div>
                      {meeting.description && (
                        <p className="text-sm text-muted-foreground">{meeting.description}</p>
                      )}
                      
                      {/* Agency contact info */}
                      <div className="pt-2 border-t mt-2 space-y-1">
                        <p className="text-xs font-medium text-foreground">Agency Contact</p>
                        <p className="text-xs text-muted-foreground">
                          📧 hello@orangedoor.com • 📞 (555) 123-4567
                        </p>
                      </div>
                      
                      {meeting.meeting_link && (
                        <a
                          href={meeting.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <Video className="h-3.5 w-3.5" />
                          Join Meeting →
                        </a>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelMeeting(meeting.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Past Meetings */}
      {pastMeetings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Past Meetings</CardTitle>
            <CardDescription>Previous calls and meetings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pastMeetings.slice(0, 5).map((meeting) => (
                <div
                  key={meeting.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                      {meeting.meeting_type === "video" ? (
                        <Video className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Phone className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{meeting.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(meeting.scheduled_at), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(meeting.status, meeting.scheduled_at)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
