import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  FileText, 
  MessageSquare, 
  Calendar, 
  CheckCircle, 
  Upload, 
  CreditCard,
  Palette,
  BarChart3,
  Activity,
  Clock,
  MessageCircle,
  ClipboardList,
  FileCheck,
  Edit3,
  Search,
  Filter,
  Sparkles,
  TrendingUp,
  Bell,
  Package,
  Users,
  Settings,
  Star,
  Zap,
  Target,
  Megaphone,
  Mail,
  Globe,
  Shield,
  Rocket
} from "lucide-react";
import { formatDistanceToNow, format, isToday, isYesterday, isThisWeek } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface ActivityItem {
  id: string;
  activity_type: string;
  title: string;
  description: string | null;
  icon: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

// Comprehensive activity type configuration
const activityTypeConfig: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  bgColor: string;
  category: string;
}> = {
  message_created: {
    icon: MessageCircle,
    label: "New Message",
    color: "text-blue-600",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    category: "communication"
  },
  meeting_scheduled: {
    icon: Calendar,
    label: "Meeting Scheduled",
    color: "text-purple-600",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    category: "meetings"
  },
  meeting_updated: {
    icon: Calendar,
    label: "Meeting Updated",
    color: "text-purple-500",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    category: "meetings"
  },
  request_submitted: {
    icon: ClipboardList,
    label: "Request Submitted",
    color: "text-amber-600",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    category: "requests"
  },
  request_updated: {
    icon: ClipboardList,
    label: "Request Updated",
    color: "text-amber-500",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    category: "requests"
  },
  deliverable_submitted: {
    icon: Package,
    label: "Deliverable Ready",
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    category: "deliverables"
  },
  deliverable_updated: {
    icon: Package,
    label: "Deliverable Updated",
    color: "text-green-500",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    category: "deliverables"
  },
  content_approved: {
    icon: CheckCircle,
    label: "Content Approved",
    color: "text-emerald-600",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    category: "approvals"
  },
  content_revision_requested: {
    icon: Edit3,
    label: "Revision Requested",
    color: "text-orange-600",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    category: "approvals"
  },
  content_reviewed: {
    icon: FileCheck,
    label: "Content Reviewed",
    color: "text-teal-600",
    bgColor: "bg-teal-100 dark:bg-teal-900/30",
    category: "approvals"
  },
  task_completed: {
    icon: Zap,
    label: "Task Completed",
    color: "text-indigo-600",
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    category: "tasks"
  },
  invoice_created: {
    icon: CreditCard,
    label: "Invoice Created",
    color: "text-slate-600",
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    category: "billing"
  },
  invoice_paid: {
    icon: CreditCard,
    label: "Invoice Paid",
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    category: "billing"
  },
  analytics_updated: {
    icon: BarChart3,
    label: "Analytics Updated",
    color: "text-cyan-600",
    bgColor: "bg-cyan-100 dark:bg-cyan-900/30",
    category: "analytics"
  },
  report_generated: {
    icon: TrendingUp,
    label: "Report Generated",
    color: "text-violet-600",
    bgColor: "bg-violet-100 dark:bg-violet-900/30",
    category: "analytics"
  },
  campaign_launched: {
    icon: Rocket,
    label: "Campaign Launched",
    color: "text-rose-600",
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    category: "campaigns"
  },
  brand_asset_uploaded: {
    icon: Palette,
    label: "Brand Asset Added",
    color: "text-pink-600",
    bgColor: "bg-pink-100 dark:bg-pink-900/30",
    category: "assets"
  },
  document_uploaded: {
    icon: FileText,
    label: "Document Uploaded",
    color: "text-gray-600",
    bgColor: "bg-gray-100 dark:bg-gray-900/30",
    category: "documents"
  },
  milestone_reached: {
    icon: Star,
    label: "Milestone Reached",
    color: "text-yellow-600",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    category: "milestones"
  },
  goal_achieved: {
    icon: Target,
    label: "Goal Achieved",
    color: "text-emerald-600",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    category: "milestones"
  }
};

const categoryConfig: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  all: { label: "All Activity", icon: Activity },
  communication: { label: "Messages", icon: MessageSquare },
  meetings: { label: "Meetings", icon: Calendar },
  requests: { label: "Requests", icon: ClipboardList },
  deliverables: { label: "Deliverables", icon: Package },
  approvals: { label: "Approvals", icon: CheckCircle },
  tasks: { label: "Tasks", icon: Zap },
  billing: { label: "Billing", icon: CreditCard },
  analytics: { label: "Analytics", icon: BarChart3 },
  campaigns: { label: "Campaigns", icon: Megaphone },
  assets: { label: "Assets", icon: Palette },
  documents: { label: "Documents", icon: FileText },
  milestones: { label: "Milestones", icon: Star }
};

interface ClientActivityTabProps {
  clientAccountId: string;
}

export function ClientActivityTab({ clientAccountId }: ClientActivityTabProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const { data: activities, isLoading } = useQuery({
    queryKey: ["client-activities", clientAccountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_feed")
        .select("*")
        .eq("client_account_id", clientAccountId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as ActivityItem[];
    },
  });

  // Set up real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('client-activity-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_feed',
          filter: `client_account_id=eq.${clientAccountId}`
        },
        (payload) => {
          const newActivity = payload.new as ActivityItem;
          
          queryClient.setQueryData<ActivityItem[]>(["client-activities", clientAccountId], (oldData) => {
            if (!oldData) return [newActivity];
            return [newActivity, ...oldData].slice(0, 100);
          });

          toast({
            title: "New Activity",
            description: newActivity.title,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, clientAccountId]);

  // Filter and group activities
  const filteredActivities = useMemo(() => {
    if (!activities) return [];
    
    return activities.filter(activity => {
      const matchesSearch = !searchQuery || 
        activity.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (activity.description?.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const config = activityTypeConfig[activity.activity_type];
      const matchesCategory = selectedCategory === "all" || 
        (config && config.category === selectedCategory);
      
      return matchesSearch && matchesCategory;
    });
  }, [activities, searchQuery, selectedCategory]);

  // Group activities by date
  const groupedActivities = useMemo(() => {
    const groups: { label: string; activities: ActivityItem[] }[] = [];
    const todayActivities: ActivityItem[] = [];
    const yesterdayActivities: ActivityItem[] = [];
    const thisWeekActivities: ActivityItem[] = [];
    const olderActivities: ActivityItem[] = [];

    filteredActivities.forEach(activity => {
      const date = new Date(activity.created_at);
      if (isToday(date)) {
        todayActivities.push(activity);
      } else if (isYesterday(date)) {
        yesterdayActivities.push(activity);
      } else if (isThisWeek(date)) {
        thisWeekActivities.push(activity);
      } else {
        olderActivities.push(activity);
      }
    });

    if (todayActivities.length > 0) {
      groups.push({ label: "Today", activities: todayActivities });
    }
    if (yesterdayActivities.length > 0) {
      groups.push({ label: "Yesterday", activities: yesterdayActivities });
    }
    if (thisWeekActivities.length > 0) {
      groups.push({ label: "This Week", activities: thisWeekActivities });
    }
    if (olderActivities.length > 0) {
      groups.push({ label: "Earlier", activities: olderActivities });
    }

    return groups;
  }, [filteredActivities]);

  // Calculate activity stats
  const activityStats = useMemo(() => {
    if (!activities) return { total: 0, today: 0, thisWeek: 0 };
    
    const now = new Date();
    const todayCount = activities.filter(a => isToday(new Date(a.created_at))).length;
    const weekCount = activities.filter(a => isThisWeek(new Date(a.created_at))).length;
    
    return { total: activities.length, today: todayCount, thisWeek: weekCount };
  }, [activities]);

  const getActivityConfig = (activityType: string) => {
    return activityTypeConfig[activityType] || {
      icon: Activity,
      label: activityType.replace(/_/g, " "),
      color: "text-muted-foreground",
      bgColor: "bg-muted",
      category: "other"
    };
  };

  const getDetailedDescription = (activity: ActivityItem) => {
    const metadata = activity.metadata || {};
    let details: string[] = [];

    switch (activity.activity_type) {
      case "message_created":
        if (metadata.sender_type === "client") {
          details.push("You sent a message to the team");
        } else {
          details.push("Your team sent you a message");
        }
        break;
      case "meeting_scheduled":
        if (metadata.meeting_type) {
          details.push(`${metadata.meeting_type} meeting`);
        }
        if (metadata.scheduled_at) {
          details.push(`Scheduled for ${format(new Date(metadata.scheduled_at as string), "MMM d 'at' h:mm a")}`);
        }
        break;
      case "deliverable_submitted":
        if (metadata.category) {
          details.push(`Category: ${metadata.category}`);
        }
        details.push("Ready for your review and feedback");
        break;
      case "content_approved":
        details.push("Great! Your approval has been recorded");
        if (metadata.content_type) {
          details.push(`Content type: ${metadata.content_type}`);
        }
        break;
      case "content_revision_requested":
        details.push("Your feedback has been sent to the team");
        if (metadata.has_feedback) {
          details.push("Detailed feedback included");
        }
        break;
      case "request_submitted":
        if (metadata.request_type) {
          details.push(`Type: ${metadata.request_type}`);
        }
        if (metadata.priority) {
          details.push(`Priority: ${metadata.priority}`);
        }
        break;
      default:
        if (activity.description) {
          details.push(activity.description);
        }
    }

    return details;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Activity Feed</h2>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Activity Feed</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Track all updates and actions on your account
          </p>
        </div>
        
        {/* Activity Stats */}
        <div className="flex gap-4">
          <div className="text-center px-4 py-2 bg-primary/10 rounded-lg">
            <div className="text-2xl font-bold text-primary">{activityStats.today}</div>
            <div className="text-xs text-muted-foreground">Today</div>
          </div>
          <div className="text-center px-4 py-2 bg-secondary rounded-lg">
            <div className="text-2xl font-bold text-foreground">{activityStats.thisWeek}</div>
            <div className="text-xs text-muted-foreground">This Week</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search activities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(categoryConfig).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {config.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
      {/* Activity Feed */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-primary" />
            Recent Updates
            {filteredActivities.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {filteredActivities.length} activities
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!filteredActivities || filteredActivities.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No activities found</p>
              <p className="text-sm">
                {searchQuery || selectedCategory !== "all" 
                  ? "Try adjusting your filters"
                  : "Your activity feed will appear here as you interact with the portal."}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-8">
                {groupedActivities.map((group) => (
                  <div key={group.label}>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs font-medium text-muted-foreground px-2 py-1 bg-muted rounded-full">
                        {group.label}
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    
                    <div className="space-y-1">
                      {group.activities.map((activity, index) => {
                        const config = getActivityConfig(activity.activity_type);
                        const IconComponent = config.icon;
                        const details = getDetailedDescription(activity);
                        const isLast = index === group.activities.length - 1;
                        
                        return (
                          <div key={activity.id} className="relative flex gap-4 pb-6 group">
                            {/* Timeline line */}
                            {!isLast && (
                              <div className="absolute left-5 top-12 bottom-0 w-px bg-border group-hover:bg-primary/30 transition-colors" />
                            )}
                            
                            {/* Icon */}
                            <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${config.bgColor} border border-border/50 group-hover:scale-110 transition-transform`}>
                              <IconComponent className={`h-5 w-5 ${config.color}`} />
                            </div>
                            
                            {/* Content */}
                            <div className="flex-1 min-w-0 bg-card hover:bg-muted/50 rounded-lg p-3 -mt-1 transition-colors border border-transparent hover:border-border">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant="outline" className={`${config.color} border-current/30 text-xs`}>
                                      {config.label}
                                    </Badge>
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Clock className="h-3 w-3" />
                                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                                    </span>
                                  </div>
                                  <p className="font-medium text-foreground mt-2">{activity.title}</p>
                                  
                                  {/* Detailed description */}
                                  {details.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                      {details.map((detail, i) => (
                                        <p key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                          <span className="text-primary mt-1">•</span>
                                          {detail}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
