import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle, CheckCircle, Bell, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface AutomationAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  source: string | null;
  source_id: string | null;
  metadata: unknown;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
}

export default function AutomationAlertsPanel() {
  const [alerts, setAlerts] = useState<AutomationAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  useEffect(() => {
    fetchAlerts();

    // Subscribe to new alerts
    const channel = supabase
      .channel("automation-alerts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "automation_alerts",
        },
        (payload) => {
          const newAlert = payload.new as AutomationAlert;
          setAlerts((prev) => [newAlert, ...prev]);
          toast.error(newAlert.title, {
            description: newAlert.message,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from("automation_alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setAlerts(data || []);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      toast.error("Failed to load alerts");
    } finally {
      setIsLoading(false);
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from("automation_alerts")
        .update({
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: "admin",
        })
        .eq("id", alertId);

      if (error) throw error;

      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId
            ? { ...a, acknowledged_at: new Date().toISOString(), acknowledged_by: "admin" }
            : a
        )
      );
      toast.success("Alert acknowledged");
    } catch (error) {
      console.error("Error acknowledging alert:", error);
      toast.error("Failed to acknowledge alert");
    }
  };

  const dismissAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from("automation_alerts")
        .delete()
        .eq("id", alertId);

      if (error) throw error;

      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      toast.success("Alert dismissed");
    } catch (error) {
      console.error("Error dismissing alert:", error);
      toast.error("Failed to dismiss alert");
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "error":
        return "bg-red-500";
      case "warning":
        return "bg-yellow-500";
      case "info":
        return "bg-blue-500";
      default:
        return "bg-gray-500";
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "error":
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Bell className="h-4 w-4 text-blue-500" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const unacknowledgedAlerts = alerts.filter((a) => !a.acknowledged_at);
  const acknowledgedAlerts = alerts.filter((a) => a.acknowledged_at);
  const displayedAlerts = showAcknowledged ? alerts : unacknowledgedAlerts;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Automation Alerts</h2>
          {unacknowledgedAlerts.length > 0 && (
            <Badge variant="destructive">{unacknowledgedAlerts.length} new</Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAcknowledged(!showAcknowledged)}
        >
          {showAcknowledged ? "Hide Acknowledged" : "Show All"}
        </Button>
      </div>

      {displayedAlerts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
            <p className="text-muted-foreground">
              {showAcknowledged
                ? "No alerts to display"
                : "All clear! No pending alerts."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayedAlerts.map((alert) => (
            <Card
              key={alert.id}
              className={alert.acknowledged_at ? "opacity-60" : ""}
            >
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    {getSeverityIcon(alert.severity)}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{alert.title}</p>
                        <Badge
                          variant="outline"
                          className={`${getSeverityColor(alert.severity)} text-white border-0`}
                        >
                          {alert.severity}
                        </Badge>
                        <Badge variant="secondary">{alert.alert_type}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {alert.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {format(new Date(alert.created_at), "MMM d, yyyy h:mm a")}
                        {alert.source && ` • Source: ${alert.source}`}
                      </p>
                      {alert.acknowledged_at && (
                        <p className="text-xs text-green-600 mt-1">
                          ✓ Acknowledged by {alert.acknowledged_by} at{" "}
                          {format(new Date(alert.acknowledged_at), "MMM d, h:mm a")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!alert.acknowledged_at && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => acknowledgeAlert(alert.id)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Acknowledge
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => dismissAlert(alert.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
