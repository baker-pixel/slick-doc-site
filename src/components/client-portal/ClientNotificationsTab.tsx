import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Trophy, 
  TrendingUp, 
  DollarSign, 
  Target,
  Star,
  Users,
  Search,
  Bell,
  CheckCircle,
  Circle,
  ChevronRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import WinDetailModal from "./WinDetailModal";

interface Notification {
  id: string;
  notification_type: string;
  title: string;
  description: string | null;
  metric: string | null;
  metric_value: string | null;
  is_positive: boolean;
  priority: string;
  is_read: boolean;
  created_at: string;
}

interface ClientNotificationsTabProps {
  clientAccountId: string;
}

export default function ClientNotificationsTab({ clientAccountId }: ClientNotificationsTabProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (clientAccountId) {
      fetchNotifications();
    }
  }, [clientAccountId]);

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from("client_notifications")
        .select("*")
        .eq("client_account_id", clientAccountId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from("client_notifications")
        .update({ is_read: true })
        .eq("id", id);

      if (error) throw error;
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
    } catch (error) {
      console.error("Error marking notification as read:", error);
      toast.error("Failed to update notification");
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
      if (unreadIds.length === 0) return;

      const { error } = await supabase
        .from("client_notifications")
        .update({ is_read: true })
        .in("id", unreadIds);

      if (error) throw error;
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      toast.success("All notifications marked as read");
    } catch (error) {
      console.error("Error marking all as read:", error);
      toast.error("Failed to update notifications");
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    setSelectedNotification(notification);
    setModalOpen(true);
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "ranking": return <Search className="h-5 w-5" />;
      case "traffic": return <TrendingUp className="h-5 w-5" />;
      case "cost": return <DollarSign className="h-5 w-5" />;
      case "conversion": return <Target className="h-5 w-5" />;
      case "review": return <Star className="h-5 w-5" />;
      case "lead": return <Users className="h-5 w-5" />;
      default: return <Trophy className="h-5 w-5" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "ranking": return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "traffic": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "cost": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "conversion": return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "review": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "lead": return "bg-pink-500/10 text-pink-500 border-pink-500/20";
      default: return "bg-primary/10 text-primary border-primary/20";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "bg-red-500/10 text-red-500";
      case "medium": return "bg-yellow-500/10 text-yellow-500";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold">Wins & Updates</h2>
            <p className="text-sm text-muted-foreground">
              Your marketing wins and achievements
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <div className="flex items-center gap-3">
            <Badge variant="secondary">{unreadCount} unread</Badge>
            <Button variant="outline" size="sm" onClick={markAllAsRead}>
              Mark all as read
            </Button>
          </div>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card className="p-8 text-center">
          <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No wins yet</h3>
          <p className="text-muted-foreground">
            We'll notify you when you achieve marketing milestones
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification, index) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card 
                className={`transition-all hover:shadow-lg hover:scale-[1.01] cursor-pointer group ${
                  notification.is_read ? "opacity-80" : "border-primary/30 shadow-sm"
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <motion.div 
                      className={`p-3 rounded-lg border ${getTypeColor(notification.notification_type)}`}
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ type: "spring", stiffness: 400 }}
                    >
                      {getTypeIcon(notification.notification_type)}
                    </motion.div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {!notification.is_read && (
                          <motion.div
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ duration: 1, repeat: Infinity }}
                          >
                            <Circle className="h-2 w-2 fill-primary text-primary" />
                          </motion.div>
                        )}
                        <h4 className="font-semibold truncate">{notification.title}</h4>
                        <Badge variant="outline" className={getPriorityColor(notification.priority)}>
                          {notification.priority}
                        </Badge>
                      </div>
                      {notification.description && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-1">
                          {notification.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {notification.metric && notification.metric_value && (
                          <>
                            <span className="font-medium text-primary">
                              {notification.metric}: {notification.is_positive ? "+" : ""}{notification.metric_value}
                            </span>
                            <span>•</span>
                          </>
                        )}
                        <span>
                          {new Date(notification.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {notification.is_read && (
                        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      )}
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <WinDetailModal
        notification={selectedNotification}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
