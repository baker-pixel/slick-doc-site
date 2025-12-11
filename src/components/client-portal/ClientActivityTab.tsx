import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Edit3
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
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

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  document: FileText,
  message: MessageSquare,
  'message-circle': MessageCircle,
  meeting: Calendar,
  calendar: Calendar,
  'calendar-check': Calendar,
  request: CheckCircle,
  'clipboard-list': ClipboardList,
  'clipboard-check': ClipboardList,
  upload: Upload,
  invoice: CreditCard,
  brand: Palette,
  analytics: BarChart3,
  activity: Activity,
  'file-check': FileCheck,
  'check-circle': CheckCircle,
  'edit': Edit3,
  'edit-3': Edit3,
  'file-text': FileText,
};

interface ClientActivityTabProps {
  clientAccountId: string;
}

export function ClientActivityTab({ clientAccountId }: ClientActivityTabProps) {
  const queryClient = useQueryClient();

  const { data: activities, isLoading } = useQuery({
    queryKey: ["client-activities", clientAccountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_feed")
        .select("*")
        .eq("client_account_id", clientAccountId)
        .order("created_at", { ascending: false })
        .limit(50);

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
          
          // Update the query cache with the new activity
          queryClient.setQueryData<ActivityItem[]>(["client-activities", clientAccountId], (oldData) => {
            if (!oldData) return [newActivity];
            // Add new activity at the beginning, keep limit of 50
            return [newActivity, ...oldData].slice(0, 50);
          });

          // Show a toast notification
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
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-foreground">Activity Feed</h2>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Recent Updates
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!activities || activities.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No recent activity</p>
              <p className="text-sm">Your activity feed will appear here as you interact with the portal.</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-1">
                {activities.map((activity, index) => {
                  const IconComponent = iconMap[activity.icon] || Activity;
                  const isLast = index === activities.length - 1;
                  
                  return (
                    <div key={activity.id} className="relative flex gap-4 pb-6">
                      {/* Timeline line */}
                      {!isLast && (
                        <div className="absolute left-5 top-10 bottom-0 w-px bg-border" />
                      )}
                      
                      {/* Icon */}
                      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
                        <IconComponent className="h-5 w-5 text-primary" />
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-foreground">{activity.title}</p>
                            {activity.description && (
                              <p className="text-sm text-muted-foreground mt-0.5">
                                {activity.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                          </div>
                        </div>
                        
                        {/* Activity type badge */}
                        <span className="inline-flex items-center mt-2 px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground capitalize">
                          {activity.activity_type.replace(/_/g, " ")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
