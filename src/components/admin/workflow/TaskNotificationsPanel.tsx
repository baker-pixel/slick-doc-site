import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  AlertTriangle,
  Clock,
  CheckCircle,
  Unlock,
  UserPlus,
  X,
  Check,
  BellOff
} from "lucide-react";

interface TaskNotification {
  id: string;
  client_task_id: string;
  notification_type: 'sla_warning' | 'sla_breach' | 'dependency_unlocked' | 'assigned' | 'overdue';
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

export function TaskNotificationsPanel() {
  const queryClient = useQueryClient();
  const [showOnlyUnread, setShowOnlyUnread] = useState(true);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["task-notifications", showOnlyUnread],
    queryFn: async () => {
      let query = supabase
        .from("task_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (showOnlyUnread) {
        query = query.eq("is_read", false);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as TaskNotification[];
    }
  });

  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("task_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notificationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-notifications"] });
    }
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("task_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-notifications"] });
      toast.success("All notifications marked as read");
    }
  });

  const dismissNotification = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("task_notifications")
        .delete()
        .eq("id", notificationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-notifications"] });
    }
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'sla_warning':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'sla_breach':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'dependency_unlocked':
        return <Unlock className="h-5 w-5 text-green-500" />;
      case 'assigned':
        return <UserPlus className="h-5 w-5 text-blue-500" />;
      case 'overdue':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default:
        return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'sla_warning':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'sla_breach':
      case 'overdue':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'dependency_unlocked':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'assigned':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <div>
              <CardTitle>Task Notifications</CardTitle>
              <CardDescription>SLA alerts, dependency unlocks, and assignments</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowOnlyUnread(!showOnlyUnread)}
            >
              {showOnlyUnread ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              {showOnlyUnread ? 'Show all' : 'Unread only'}
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllAsRead.mutate()}
              >
                <Check className="h-4 w-4 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-3" />
              <p className="text-muted-foreground">
                {showOnlyUnread ? 'No unread notifications' : 'No notifications yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 rounded-lg border ${
                    notification.is_read ? 'bg-muted/30' : 'bg-background border-l-4 border-l-primary'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {getIcon(notification.notification_type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{notification.title}</span>
                        <Badge className={getBadgeColor(notification.notification_type)}>
                          {notification.notification_type.replace('_', ' ')}
                        </Badge>
                      </div>
                      {notification.message && (
                        <p className="text-sm text-muted-foreground">{notification.message}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {!notification.is_read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markAsRead.mutate(notification.id)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => dismissNotification.mutate(notification.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
