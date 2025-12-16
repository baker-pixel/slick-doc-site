import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, CheckCircle, Bell, Package } from "lucide-react";

interface TaskCompletionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminPassword: string;
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

// Generate deliverable title options based on task name and category
const generateDeliverableTitles = (taskName: string, category: string, businessName?: string): string[] => {
  const titles: string[] = [];
  const cleanTaskName = taskName.replace(/^(Create|Build|Design|Develop|Write|Setup|Configure|Implement|Add|Update)\s+/i, '');
  
  // Add task-based title
  titles.push(`${cleanTaskName} - Completed`);
  titles.push(`${taskName} Deliverable`);
  
  // Category-specific suggestions
  switch (category.toLowerCase()) {
    case 'seo':
      titles.push('SEO Audit Report', 'Keyword Research Document', 'SEO Recommendations', 'Technical SEO Analysis', 'Backlink Report');
      break;
    case 'content':
      titles.push('Content Strategy Document', 'Blog Post Draft', 'Content Calendar', 'Copy Revision', 'Social Media Content');
      break;
    case 'design':
      titles.push('Design Mockup', 'Brand Assets Package', 'UI/UX Design', 'Logo Design', 'Marketing Collateral');
      break;
    case 'development':
      titles.push('Website Update', 'Feature Implementation', 'Bug Fix Report', 'Performance Optimization', 'Code Review');
      break;
    case 'marketing':
      titles.push('Marketing Campaign Assets', 'Ad Creative Package', 'Email Campaign', 'Marketing Strategy', 'Campaign Report');
      break;
    case 'ads':
      titles.push('Ad Campaign Setup', 'Ad Creative Package', 'PPC Report', 'Ad Performance Analysis', 'Landing Page');
      break;
    case 'email':
      titles.push('Email Sequence', 'Newsletter Design', 'Email Template', 'Email Campaign Report', 'Automation Setup');
      break;
    case 'analytics':
      titles.push('Analytics Report', 'Performance Dashboard', 'Monthly Metrics Report', 'Conversion Analysis', 'Traffic Report');
      break;
    case 'onboarding':
      titles.push('Onboarding Documentation', 'Welcome Package', 'Setup Guide', 'Account Configuration', 'Training Materials');
      break;
    default:
      titles.push('Project Deliverable', 'Task Completion Report', 'Work Summary', 'Progress Update');
  }
  
  // Add business-specific option if available
  if (businessName) {
    titles.push(`${businessName} - ${category.charAt(0).toUpperCase() + category.slice(1)} Update`);
  }
  
  return [...new Set(titles)]; // Remove duplicates
};

// Map task category to deliverable category
const mapTaskCategoryToDeliverableCategory = (taskCategory: string): string => {
  const mapping: Record<string, string> = {
    'seo': 'seo',
    'content': 'content',
    'design': 'design',
    'development': 'development',
    'marketing': 'marketing',
    'ads': 'marketing',
    'email': 'marketing',
    'analytics': 'report',
    'onboarding': 'general',
    'general': 'general',
  };
  return mapping[taskCategory.toLowerCase()] || 'general';
};

export function TaskCompletionModal({ open, onOpenChange, adminPassword, task, onComplete }: TaskCompletionModalProps) {
  const [loading, setLoading] = useState(false);
  const [createDeliverable, setCreateDeliverable] = useState(true);
  const [notifyClient, setNotifyClient] = useState(true);
  const [deliverableTitle, setDeliverableTitle] = useState("");
  const [deliverableDescription, setDeliverableDescription] = useState("");
  const [deliverableCategory, setDeliverableCategory] = useState("general");
  const [completionNotes, setCompletionNotes] = useState("");

  // Generate title options based on task
  const deliverableTitleOptions = useMemo(() => {
    if (!task) return [];
    return generateDeliverableTitles(task.name, task.category, task.client_accounts?.business_name);
  }, [task]);

  // Auto-set category based on task category when modal opens
  useMemo(() => {
    if (task && open) {
      setDeliverableCategory(mapTaskCategoryToDeliverableCategory(task.category));
    }
  }, [task, open]);

  const getErrorMessage = (err: unknown) => {
    if (!err) return "Unknown error";
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    if (typeof err === "object") {
      const anyErr = err as any;
      return (
        anyErr.message ||
        anyErr.error_description ||
        anyErr.details ||
        anyErr.hint ||
        JSON.stringify(anyErr)
      );
    }
    return String(err);
  };

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

      if (taskError) {
        console.error("Task update failed:", taskError);
        throw new Error(`Task update failed: ${getErrorMessage(taskError)}`);
      }

      // 2. Create deliverable if requested (use admin function to bypass RLS)
      if (createDeliverable && deliverableTitle) {
        const { error: deliverableFnError } = await supabase.functions.invoke("admin", {
          body: {
            action: "create_deliverable",
            password: adminPassword,
            data: {
              client_account_id: task.client_account_id,
              title: deliverableTitle,
              description: deliverableDescription || `Deliverable from task: ${task.name}`,
              category: deliverableCategory,
            },
          },
        });

        if (deliverableFnError) {
          console.error("Deliverable creation (admin fn) failed:", deliverableFnError);
          throw new Error(`Deliverable creation failed: ${getErrorMessage(deliverableFnError)}`);
        }
      }

      // 3. Create client notification if requested (use admin function to bypass RLS)
      if (notifyClient) {
        const notificationTitle =
          createDeliverable && deliverableTitle
            ? `New deliverable ready: ${deliverableTitle}`
            : `Task completed: ${task.name}`;

        const notificationDescription =
          createDeliverable && deliverableTitle
            ? "A new deliverable is ready for your review in the portal."
            : "Your team has completed a task. Check your portal for updates.";

        const { error: notificationFnError } = await supabase.functions.invoke("admin", {
          body: {
            action: "createClientNotification",
            password: adminPassword,
            notification: {
              client_account_id: task.client_account_id,
              notification_type: createDeliverable ? "deliverable" : "task_complete",
              title: notificationTitle,
              description: notificationDescription,
              priority: "high",
            },
          },
        });

        if (notificationFnError) {
          console.error("Client notification (admin fn) failed:", notificationFnError);
          throw new Error(`Client notification failed: ${getErrorMessage(notificationFnError)}`);
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
      const msg = getErrorMessage(err);
      console.error("Task completion failed:", err);
      toast.error(`Failed to complete task: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Complete Task
          </DialogTitle>
          <DialogDescription>
            Complete "{task.name}" for {task.client_accounts?.business_name ?? "this client"}
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
                  <Select value={deliverableTitle} onValueChange={setDeliverableTitle}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a deliverable title..." />
                    </SelectTrigger>
                    <SelectContent>
                      {deliverableTitleOptions.map((title) => (
                        <SelectItem key={title} value={title}>
                          {title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
