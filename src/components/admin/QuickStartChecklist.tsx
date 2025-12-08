import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  Circle, 
  Mail, 
  FileText, 
  Users, 
  Send, 
  Target,
  Rocket,
  ChevronDown,
  ChevronUp,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  completed: boolean;
  action?: string;
  actionLabel?: string;
}

interface QuickStartChecklistProps {
  onNavigate: (section: string) => void;
  password: string;
}

export function QuickStartChecklist({ onNavigate, password }: QuickStartChecklistProps) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem("admin_checklist_dismissed");
    if (dismissed === "true") {
      setIsDismissed(true);
    }
    checkProgress();
  }, [password]);

  const checkProgress = async () => {
    setIsLoading(true);
    try {
      // Fetch counts from various tables to check progress
      const [
        templatesResult,
        sequencesResult,
        clientsResult,
        sopsResult,
        campaignsResult,
        contentResult
      ] = await Promise.all([
        supabase.from("email_templates").select("id", { count: "exact", head: true }),
        supabase.from("email_sequences").select("id", { count: "exact", head: true }),
        supabase.from("client_accounts").select("id", { count: "exact", head: true }),
        supabase.from("sop_documents").select("id", { count: "exact", head: true }),
        supabase.from("email_logs").select("id", { count: "exact", head: true }),
        supabase.from("generated_content").select("id", { count: "exact", head: true })
      ]);

      const templateCount = templatesResult.count || 0;
      const sequenceCount = sequencesResult.count || 0;
      const clientCount = clientsResult.count || 0;
      const sopCount = sopsResult.count || 0;
      const emailsSent = campaignsResult.count || 0;
      const contentCount = contentResult.count || 0;

      setItems([
        {
          id: "template",
          label: "Create an email template",
          description: "Set up reusable email designs for your campaigns",
          icon: <Mail className="w-4 h-4" />,
          completed: templateCount > 0,
          action: "templates",
          actionLabel: "Create Template"
        },
        {
          id: "sequence",
          label: "Set up an email sequence",
          description: "Automate follow-up emails for new leads",
          icon: <FileText className="w-4 h-4" />,
          completed: sequenceCount > 0,
          action: "sequences",
          actionLabel: "Create Sequence"
        },
        {
          id: "client",
          label: "Add your first client",
          description: "Start managing client accounts and automation",
          icon: <Users className="w-4 h-4" />,
          completed: clientCount > 0,
          action: "clients",
          actionLabel: "Add Client"
        },
        {
          id: "sop",
          label: "Upload an SOP document",
          description: "Document your processes for consistent delivery",
          icon: <Target className="w-4 h-4" />,
          completed: sopCount > 0,
          action: "sops",
          actionLabel: "Upload SOP"
        },
        {
          id: "email",
          label: "Send your first email",
          description: "Test your email setup with a campaign",
          icon: <Send className="w-4 h-4" />,
          completed: emailsSent > 0,
          action: "campaigns",
          actionLabel: "Send Email"
        },
        {
          id: "content",
          label: "Generate content",
          description: "Use AI to create marketing content",
          icon: <Sparkles className="w-4 h-4" />,
          completed: contentCount > 0,
          action: "content-review",
          actionLabel: "View Content"
        }
      ]);
    } catch (error) {
      console.error("Error checking progress:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const completedCount = items.filter(item => item.completed).length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const isComplete = completedCount === totalCount && totalCount > 0;

  const handleDismiss = () => {
    localStorage.setItem("admin_checklist_dismissed", "true");
    setIsDismissed(true);
  };

  const handleShow = () => {
    localStorage.removeItem("admin_checklist_dismissed");
    setIsDismissed(false);
  };

  if (isDismissed) {
    return (
      <Button 
        variant="outline" 
        size="sm" 
        onClick={handleShow}
        className="mb-4"
      >
        <Rocket className="w-4 h-4 mr-2" />
        Show Setup Checklist
      </Button>
    );
  }

  if (isComplete) {
    return (
      <Card className="mb-6 border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-100 dark:bg-green-900">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-medium text-green-800 dark:text-green-200">Setup Complete!</p>
                <p className="text-sm text-green-600 dark:text-green-400">
                  You've completed all setup steps. You're ready to scale!
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleDismiss}>
              Dismiss
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Rocket className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Quick Start Checklist</CardTitle>
              <p className="text-sm text-muted-foreground">
                Complete these steps to get the most out of your admin
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono">
              {completedCount}/{totalCount}
            </Badge>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        <Progress value={progressPercent} className="mt-3 h-2" />
      </CardHeader>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="pt-0">
              <div className="space-y-2">
                {isLoading ? (
                  <div className="py-4 text-center text-muted-foreground">
                    Loading progress...
                  </div>
                ) : (
                  items.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border transition-colors",
                        item.completed 
                          ? "bg-muted/30 border-transparent" 
                          : "bg-background border-border hover:border-primary/30"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-1.5 rounded-full",
                          item.completed 
                            ? "bg-green-100 dark:bg-green-900" 
                            : "bg-muted"
                        )}>
                          {item.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <span className="text-muted-foreground">{item.icon}</span>
                          )}
                        </div>
                        <div>
                          <p className={cn(
                            "text-sm font-medium",
                            item.completed && "line-through text-muted-foreground"
                          )}>
                            {item.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.description}
                          </p>
                        </div>
                      </div>
                      
                      {!item.completed && item.action && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => onNavigate(item.action!)}
                        >
                          {item.actionLabel}
                        </Button>
                      )}
                      
                      {item.completed && (
                        <Badge variant="secondary" className="text-green-600 dark:text-green-400">
                          Done
                        </Badge>
                      )}
                    </motion.div>
                  ))
                )}
              </div>

              <div className="flex justify-end mt-4 pt-3 border-t">
                <Button variant="ghost" size="sm" onClick={handleDismiss}>
                  Dismiss checklist
                </Button>
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
