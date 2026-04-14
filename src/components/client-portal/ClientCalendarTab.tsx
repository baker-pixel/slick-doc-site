import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, isSameMonth } from "date-fns";
import { cn } from "@/lib/utils";

interface ClientCalendarTabProps {
  clientAccountId: string;
  clientTier?: string;
}

interface CalendarItem {
  id: string;
  title: string;
  content: string;
  content_type: string;
  scheduled_for: string;
  platform: string | null;
  status: string;
  published_at: string | null;
  client_approved: boolean | null;
}

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: "bg-blue-600",
  facebook: "bg-indigo-600",
  instagram: "bg-pink-500",
  twitter: "bg-gray-900",
  blog: "bg-green-600",
  blog_post: "bg-green-600",
  email: "bg-orange-500",
};

const TIER_CADENCE: Record<string, string> = {
  foundation: "1 blog/mo · Monthly GBP posts · Quarterly SEO",
  growth: "2 blogs/mo · Weekly LinkedIn · Email sequences · Monthly call",
  transformation: "Full content suite · 2×/week social · Lead magnets · Full funnel",
};

const STATUS_FILTERS = ["all", "pending", "scheduled", "published", "failed"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All",
  pending: "Pending Approval",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
};

export function ClientCalendarTab({ clientAccountId, clientTier = "foundation" }: ClientCalendarTabProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["client-calendar", clientAccountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_calendar")
        .select("id, title, content, content_type, scheduled_for, platform, status, published_at, client_approved")
        .eq("client_account_id", clientAccountId)
        .order("scheduled_for", { ascending: true });
      if (error) throw error;
      return (data || []) as CalendarItem[];
    },
  });

  const filteredItems = useMemo(() => {
    if (statusFilter === "all") return items;
    if (statusFilter === "pending") return items.filter(i => !i.client_approved && i.status !== "published");
    return items.filter(i => i.status === statusFilter);
  }, [items, statusFilter]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDow = getDay(monthStart); // 0=Sun

  const getItemsForDay = (day: Date) =>
    filteredItems.filter(item => isSameDay(new Date(item.scheduled_for), day));

  const getPlatformColor = (item: CalendarItem) =>
    PLATFORM_COLORS[item.platform || item.content_type] || "bg-muted";

  const tier = clientTier.toLowerCase();
  const cadence = TIER_CADENCE[tier] || TIER_CADENCE.foundation;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Tier banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 flex items-center gap-3">
          <CalendarIcon className="h-5 w-5 text-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold capitalize">{tier} Plan — Content Cadence</p>
            <p className="text-xs text-muted-foreground">{cadence}</p>
          </div>
        </CardContent>
      </Card>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(sf => (
          <Button
            key={sf}
            variant={statusFilter === sf ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(sf)}
          >
            {STATUS_LABELS[sf]}
          </Button>
        ))}
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-bold">{format(currentMonth, "MMMM yyyy")}</h2>
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {/* Day headers */}
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div key={d} className="bg-muted p-2 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}

        {/* Empty cells before first day */}
        {Array.from({ length: startDow }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-background p-2 min-h-[80px]" />
        ))}

        {/* Day cells */}
        {days.map(day => {
          const dayItems = getItemsForDay(day);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "bg-background p-1.5 min-h-[80px] relative",
                isToday && "ring-2 ring-primary/30 ring-inset"
              )}
            >
              <span className={cn(
                "text-xs font-medium",
                isToday ? "text-primary font-bold" : "text-muted-foreground"
              )}>
                {format(day, "d")}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayItems.slice(0, 3).map(item => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={cn(
                      "w-full text-left text-[10px] text-white px-1 py-0.5 rounded truncate block",
                      getPlatformColor(item)
                    )}
                    title={item.title}
                  >
                    {item.title}
                  </button>
                ))}
                {dayItems.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{dayItems.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail slide-over */}
      <Sheet open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <SheetContent>
          {selectedItem && (
            <>
              <SheetHeader>
                <SheetTitle className="text-lg">{selectedItem.title}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {selectedItem.platform && (
                    <Badge className={cn("text-white", getPlatformColor(selectedItem))}>
                      {selectedItem.platform}
                    </Badge>
                  )}
                  <Badge variant={
                    selectedItem.status === "published" ? "default" :
                    selectedItem.status === "failed" ? "destructive" : "secondary"
                  }>
                    {selectedItem.status}
                  </Badge>
                  {selectedItem.client_approved === false && (
                    <Badge variant="outline" className="border-amber-500 text-amber-600">Awaiting Approval</Badge>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Scheduled</p>
                  <p className="text-sm">{format(new Date(selectedItem.scheduled_for), "MMM d, yyyy 'at' h:mm a")}</p>
                </div>

                {selectedItem.published_at && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Published</p>
                    <p className="text-sm">{format(new Date(selectedItem.published_at), "MMM d, yyyy 'at' h:mm a")}</p>
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Content</p>
                  <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded-lg p-3">{selectedItem.content}</p>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default ClientCalendarTab;
