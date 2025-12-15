import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, CheckCircle, FileUp, Bell, Package } from "lucide-react";

interface TaskCompletionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: {
    id: string;
    name: string;
    client_account_id: string;
    category: string;
    client_accounts?: {
      business_name: string;
    };
  } | null;
  onComplete: () => void;
}

export function TaskCompletionModal({ open, onOpenChange, task, onComplete }: TaskCompletionModalProps) {
  const [loading, setLoading] = useState(false);
  const [createDeliverable, setCreateDeliverable] = useState(true);
  const [notifyClient, setNotifyClient] = useState(true);
  const [deliverableTitle, setDeliverableTitle] = useState("");
  const [deliverableDescription, setDeliverableDescription] = useState("");
  const [deliverableCategory, setDeliverableCategory] = useState("general");
  const [completionNotes, setCompletionNotes] = useState("");

  const handleComplete = async () => {
    if (!task) return;
    
    setLoading(true);
    try {
      // 1. Update task status
      const { error: taskError } = await supabase
        .from("client_tasks")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          notes: completionNotes || null,
        })
        .eq("id", task.id);

      if (taskError) throw taskError;

      // 2. Create deliverable if requested
      if (createDeliverable && deliverableTitle) {
        const { error: deliverableError } = await supabase
          .from("deliverables")
          .insert({
            client_account_id: task.client_account_id,
            title: deliverableTitle,
            description: deliverableDescription || `Deliverable from task: ${task.name}`,
            category: deliverableCategory,
            status: "pending_review",
          });

        if (deliverableError) throw deliverableError;
      }

      // 3. Create client notification if requested
      if (notifyClient) {
        const notificationTitle = createDeliverable && deliverableTitle
          ? `New deliverable ready: ${deliverableTitle}`
          : `Task completed: ${task.name}`;
        
        const notificationDescription = createDeliverable && deliverableTitle
          ? "A new deliverable is ready for your review in the portal."
          : "Your team has completed a task. Check your portal for updates.";

        const { error: notificationError } = await supabase
          .from("client_notifications")
          .insert({
            client_account_id: task.client_account_id,
            notification_type: createDeliverable ? "deliverable" : "task_complete",
            title: notificationTitle,
            description: notificationDescription,
            priority: "high",
            is_positive: true,
          });

        if (notificationError) {
          console.error("Failed to create notification:", notificationError);
        }
      }

      toast.success(
        createDeliverable && deliverableTitle
          ? "Task completed and deliverable created!"
          : "Task marked as complete!"
      );
      
      // Reset form
      setDeliverableTitle("");
      setDeliverableDescription("");
      setCompletionNotes("");
      setCreateDeliverable(true);
      setNotifyClient(true);
      
      onComplete();
      onOpenChange(false);
    } catch (err) {
      toast.error(`Failed to complete task: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Complete Task
          </DialogTitle>
          <DialogDescription>
            Complete "{task.name}" for {task.client_accounts?.business_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Completion Notes */}
          <div className="space-y-2">
            <Label>Completion Notes (optional)</Label>
            <Textarea
              placeholder="Any notes about this task completion..."
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Create Deliverable Option */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-3">
              <Checkbox
                id="createDeliverable"
                checked={createDeliverable}
                onCheckedChange={(checked) => setCreateDeliverable(!!checked)}
              />
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                <Label htmlFor="createDeliverable" className="font-medium cursor-pointer">
                  Create a deliverable for client review
                </Label>
              </div>
            </div>

            {createDeliverable && (
              <div className="space-y-3 ml-6">
                <div className="space-y-2">
                  <Label>Deliverable Title *</Label>
                  <Input
                    placeholder="e.g., Website Homepage Design v1"
                    value={deliverableTitle}
                    onChange={(e) => setDeliverableTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="Describe what's being delivered..."
                    value={deliverableDescription}
                    onChange={(e) => setDeliverableDescription(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={deliverableCategory} onValueChange={setDeliverableCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="design">Design</SelectItem>
                      <SelectItem value="content">Content</SelectItem>
                      <SelectItem value="development">Development</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="report">Report</SelectItem>
                      <SelectItem value="seo">SEO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Notify Client Option */}
          <div className="flex items-center gap-3 border rounded-lg p-4">
            <Checkbox
              id="notifyClient"
              checked={notifyClient}
              onCheckedChange={(checked) => setNotifyClient(!!checked)}
            />
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <Label htmlFor="notifyClient" className="font-medium cursor-pointer">
                Notify client about this update
              </Label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleComplete} disabled={loading || (createDeliverable && !deliverableTitle)}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Complete Task
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
