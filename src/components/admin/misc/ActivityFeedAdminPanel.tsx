import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { callAdminApi } from "@/lib/admin-api";
import { formatDistanceToNow, format } from "date-fns";
import { 
  Search, 
  RefreshCw, 
  Activity, 
  MessageCircle, 
  Calendar, 
  ClipboardList, 
  FileCheck, 
  CheckCircle, 
  Edit3, 
  FileText,
  ChevronLeft,
  ChevronRight,
  Filter
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityItem {
  id: string;
  activity_type: string;
  title: string;
  description: string | null;
  icon: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  client_account_id: string;
  client_account?: {
    business_name: string;
  };
}

interface ClientAccount {
  id: string;
  business_name: string;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'message-circle': MessageCircle,
  'calendar': Calendar,
  'calendar-check': Calendar,
  'clipboard-list': ClipboardList,
  'clipboard-check': ClipboardList,
  'file-check': FileCheck,
  'check-circle': CheckCircle,
  'edit': Edit3,
  'edit-3': Edit3,
  'file-text': FileText,
  'activity': Activity,
};

const activityTypeLabels: Record<string, string> = {
  'message_created': 'Message',
  'meeting_scheduled': 'Meeting Scheduled',
  'meeting_updated': 'Meeting Updated',
  'request_submitted': 'Request Submitted',
  'request_updated': 'Request Updated',
  'deliverable_submitted': 'Deliverable Submitted',
  'deliverable_updated': 'Deliverable Updated',
  'content_approved': 'Content Approved',
  'content_revision_requested': 'Revision Requested',
  'content_reviewed': 'Content Reviewed',
};

export function ActivityFeedAdminPanel() {
  const { adminPassword } = useAdminAuth();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [clientAccounts, setClientAccounts] = useState<ClientAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [activitiesRes, clientsRes] = await Promise.all([
        callAdminApi(adminPassword, { action: "fetch_activities" }),
        callAdminApi(adminPassword, { action: "fetch_client_accounts" }),
      ]);

      if ((activitiesRes.data as any)?.activities) {
        setActivities((activitiesRes.data as any).activities);
      }
      if ((clientsRes.data as any)?.clients) {
        setClientAccounts((clientsRes.data as any).clients);
      }
    } catch (error) {
      console.error("Error fetching activities:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Set up real-time subscription
    const channel = supabase
      .channel('activity-feed-admin')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_feed'
        },
        (payload) => {
          const newActivity = payload.new as ActivityItem;
          setActivities(prev => [newActivity, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getClientName = (clientId: string): string => {
    const client = clientAccounts.find(c => c.id === clientId);
    return client?.business_name || 'Unknown Client';
  };

  const filteredActivities = activities.filter(activity => {
    const matchesSearch = search === "" || 
      activity.title.toLowerCase().includes(search.toLowerCase()) ||
      activity.description?.toLowerCase().includes(search.toLowerCase()) ||
      getClientName(activity.client_account_id).toLowerCase().includes(search.toLowerCase());
    
    const matchesClient = clientFilter === "all" || activity.client_account_id === clientFilter;
    const matchesType = typeFilter === "all" || activity.activity_type === typeFilter;
    
    return matchesSearch && matchesClient && matchesType;
  });

  const totalPages = Math.ceil(filteredActivities.length / pageSize);
  const paginatedActivities = filteredActivities.slice((page - 1) * pageSize, page * pageSize);

  const uniqueActivityTypes = [...new Set(activities.map(a => a.activity_type))];

  const getActivityTypeBadge = (type: string) => {
    const colorMap: Record<string, string> = {
      'message_created': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      'meeting_scheduled': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
      'meeting_updated': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
      'request_submitted': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
      'request_updated': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
      'deliverable_submitted': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
      'deliverable_updated': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
      'content_approved': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      'content_revision_requested': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
      'content_reviewed': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
    };

    return (
      <Badge className={cn("text-xs", colorMap[type] || 'bg-muted text-muted-foreground')}>
        {activityTypeLabels[type] || type.replace(/_/g, ' ')}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity Feed
            </CardTitle>
            <CardDescription>
              View all client activities across accounts in real-time
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
            <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
        
        <div className="flex flex-wrap gap-2 items-center mt-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search activities..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          
          <Select value={clientFilter} onValueChange={(v) => { setClientFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clientAccounts.map(client => (
                <SelectItem key={client.id} value={client.id}>
                  {client.business_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {uniqueActivityTypes.map(type => (
                <SelectItem key={type} value={type}>
                  {activityTypeLabels[type] || type.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {(search || clientFilter !== "all" || typeFilter !== "all") && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => { setSearch(""); setClientFilter("all"); setTypeFilter("all"); setPage(1); }}
            >
              <Filter className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start gap-4 p-4 border rounded-lg">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No activities found</p>
          </div>
        ) : (
          <>
            <ScrollArea className="h-[600px]">
              <div className="space-y-3">
                {paginatedActivities.map((activity) => {
                  const IconComponent = iconMap[activity.icon || 'activity'] || Activity;
                  
                  return (
                    <div
                      key={activity.id}
                      className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <IconComponent className="h-5 w-5 text-primary" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-sm">{activity.title}</p>
                            {activity.description && (
                              <p className="text-sm text-muted-foreground mt-0.5">
                                {activity.description}
                              </p>
                            )}
                          </div>
                          {getActivityTypeBadge(activity.activity_type)}
                        </div>
                        
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-xs">
                            {getClientName(activity.client_account_id)}
                          </Badge>
                          <span>•</span>
                          <span title={format(new Date(activity.created_at), 'PPpp')}>
                            {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, filteredActivities.length)} of {filteredActivities.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={page === 1} 
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm">
                    Page {page} of {totalPages}
                  </span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={page === totalPages} 
                    onClick={() => setPage(p => p + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ActivityFeedAdminPanel;
