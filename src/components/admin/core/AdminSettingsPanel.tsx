import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { Save, Plus, Trash2, RefreshCw, Settings2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface AdminSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface AdminSettingsPanelProps {
  adminPassword: string;
}

export function AdminSettingsPanel({ adminPassword }: AdminSettingsPanelProps) {
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editedSettings, setEditedSettings] = useState<Record<string, { value: string; description: string }>>({});
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newSetting, setNewSetting] = useState({ key: "", value: "", description: "" });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin", {
        body: { action: "fetch_settings", password: adminPassword },
      });

      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Something went wrong");
      }

      setSettings(data.settings || []);
      
      // Initialize edited settings
      const initialEdits: Record<string, { value: string; description: string }> = {};
      (data.settings || []).forEach((setting: AdminSetting) => {
        initialEdits[setting.id] = { 
          value: setting.value, 
          description: setting.description || "" 
        };
      });
      setEditedSettings(initialEdits);
    } catch (error: any) {
      toast({ 
        title: "Error fetching settings", 
        description: error.message, 
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateSetting = async (id: string) => {
    const edited = editedSettings[id];
    if (!edited) return;

    try {
      const { data, error } = await supabase.functions.invoke("admin", {
        body: { 
          action: "update_setting", 
          password: adminPassword,
          data: {
            settingId: id,
            value: edited.value,
            description: edited.description
          }
        },
      });

      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Something went wrong");
      }

      toast({ title: "Setting updated successfully" });
      fetchSettings();
    } catch (error: any) {
      toast({ 
        title: "Error updating setting", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  };

  const handleAddSetting = async () => {
    if (!newSetting.key.trim() || !newSetting.value.trim()) {
      toast({ 
        title: "Key and value are required", 
        variant: "destructive" 
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("admin", {
        body: { 
          action: "add_setting", 
          password: adminPassword,
          data: {
            key: newSetting.key.trim(),
            value: newSetting.value.trim(),
            description: newSetting.description.trim() || null
          }
        },
      });

      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Something went wrong");
      }

      toast({ title: "Setting added successfully" });
      setNewSetting({ key: "", value: "", description: "" });
      setIsAddDialogOpen(false);
      fetchSettings();
    } catch (error: any) {
      toast({ 
        title: "Error adding setting", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  };

  const handleDeleteSetting = async (id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("admin", {
        body: { 
          action: "delete_setting", 
          password: adminPassword,
          data: {
            settingId: id
          }
        },
      });

      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Something went wrong");
      }

      toast({ title: "Setting deleted successfully" });
      fetchSettings();
    } catch (error: any) {
      toast({ 
        title: "Error deleting setting", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  };

  const hasChanges = (id: string) => {
    const setting = settings.find(s => s.id === id);
    const edited = editedSettings[id];
    if (!setting || !edited) return false;
    return setting.value !== edited.value || (setting.description || "") !== edited.description;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Admin Settings
            </CardTitle>
            <CardDescription>
              Manage configurable settings for your application
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchSettings} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Setting
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Setting</DialogTitle>
                  <DialogDescription>
                    Create a new configurable setting for your application.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-key">Key</Label>
                    <Input
                      id="new-key"
                      placeholder="e.g., admin_notification_email"
                      value={newSetting.key}
                      onChange={(e) => setNewSetting(prev => ({ ...prev, key: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-value">Value</Label>
                    <Input
                      id="new-value"
                      placeholder="e.g., admin@example.com"
                      value={newSetting.value}
                      onChange={(e) => setNewSetting(prev => ({ ...prev, value: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-description">Description (optional)</Label>
                    <Textarea
                      id="new-description"
                      placeholder="What this setting is used for..."
                      value={newSetting.description}
                      onChange={(e) => setNewSetting(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddSetting}>
                    Add Setting
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && settings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading settings...
            </div>
          ) : settings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No settings configured yet. Click "Add Setting" to create one.
            </div>
          ) : (
            <div className="space-y-6">
              {settings.map((setting) => (
                <div key={setting.id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                        {setting.key}
                      </code>
                      <p className="text-xs text-muted-foreground">
                        Last updated: {new Date(setting.updated_at).toLocaleString()}
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Setting</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete the setting "{setting.key}"? 
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteSetting(setting.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor={`value-${setting.id}`}>Value</Label>
                    <Input
                      id={`value-${setting.id}`}
                      value={editedSettings[setting.id]?.value || ""}
                      onChange={(e) => setEditedSettings(prev => ({
                        ...prev,
                        [setting.id]: { ...prev[setting.id], value: e.target.value }
                      }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor={`desc-${setting.id}`}>Description</Label>
                    <Textarea
                      id={`desc-${setting.id}`}
                      value={editedSettings[setting.id]?.description || ""}
                      onChange={(e) => setEditedSettings(prev => ({
                        ...prev,
                        [setting.id]: { ...prev[setting.id], description: e.target.value }
                      }))}
                      className="resize-none"
                      rows={2}
                    />
                  </div>
                  
                  {hasChanges(setting.id) && (
                    <Button 
                      size="sm" 
                      onClick={() => handleUpdateSetting(setting.id)}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
