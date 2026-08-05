import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Sparkles, 
  PlayCircle, 
  Activity, 
  Bell, 
  LayoutDashboard, 
  MessageCircle, 
  Calendar,
  FileCheck,
  Package,
  FolderOpen,
  Palette,
  BarChart3,
  Receipt,
  HelpCircle,
  Mail,
  Phone
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientHelpTabProps {
  onStartTour: () => void;
  onNavigate?: (tab: string) => void;
}

const sections = [
  {
    title: "Overview",
    items: [
      { id: "activity", label: "Activity Feed", icon: Activity, description: "See recent activity on your account" },
      { id: "notifications", label: "Wins & Updates", icon: Bell, description: "Celebrate wins and important updates" },
      { id: "projects", label: "Your Agents", icon: LayoutDashboard, description: "See what each agent is working on" },
      { id: "analytics", label: "Analytics", icon: BarChart3, description: "View performance metrics and reports" },
    ],
  },
  {
    title: "Communication",
    items: [
      { id: "messages", label: "Messages", icon: MessageCircle, description: "Chat with your marketing team, or switch to Formal Requests to submit a tracked request" },
      { id: "meetings", label: "Meetings", icon: Calendar, description: "Schedule and manage meetings" },
    ],
  },
  {
    title: "Content",
    items: [
      { id: "approvals", label: "Approvals", icon: FileCheck, description: "Review and approve content" },
      { id: "deliverables", label: "Deliverables", icon: Package, description: "Access completed work" },
      { id: "documents", label: "Documents", icon: FolderOpen, description: "View, download, and sign your files and agreements" },
    ],
  },
  {
    title: "Account",
    items: [
      { id: "brand", label: "Brand Assets", icon: Palette, description: "Access brand guidelines" },
      { id: "invoices", label: "Invoices", icon: Receipt, description: "View billing and payments" },
    ],
  },
];

const faqs = [
  {
    question: "How do I approve content?",
    answer: "Go to the Approvals section, review the content, and click 'Approve' or 'Request Revisions' with your feedback.",
  },
  {
    question: "How do I schedule a meeting?",
    answer: "Visit the Meetings section and click 'Request Meeting' to choose a time that works for you.",
  },
  {
    question: "How do I submit a request?",
    answer: "Go to Requests, click 'New Request', fill out the details, and submit. You'll be notified when it's completed.",
  },
  {
    question: "Where can I find my invoices?",
    answer: "All invoices are in the Invoices section under Account. You can view, download, and track payment status there.",
  },
];

export function ClientHelpTab({ onStartTour, onNavigate }: ClientHelpTabProps) {
  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 md:p-8">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Welcome to Your Portal</h1>
              <p className="text-muted-foreground">Everything you need in one place</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl mb-4">
            Your client portal is your central hub for collaborating with your marketing team. 
            Check in on your agents, approve content, view analytics, and communicate - all in one convenient location.
          </p>
          <Button onClick={onStartTour} className="gap-2 rounded-xl">
            <PlayCircle className="h-4 w-4" />
            Take a Guided Tour
          </Button>
        </div>
        <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
      </div>

      {/* Portal Sections Guide */}
      <div className="space-y-6">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          Portal Sections
        </h2>
        
        <div className="grid gap-6 md:grid-cols-2">
          {sections.map((section) => (
            <Card key={section.title} className="border-0 bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate?.(item.id)}
                    disabled={!onNavigate}
                    className="flex w-full items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* FAQs */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold">Frequently Asked Questions</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {faqs.map((faq, index) => (
            <Card key={index} className="border-0 bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{faq.question}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{faq.answer}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Contact Support */}
      <Card className="border-0 bg-gradient-to-r from-muted/50 to-muted/30">
        <CardContent className="flex flex-col md:flex-row items-center justify-between gap-4 p-6">
          <div>
            <h3 className="font-bold mb-1">Need More Help?</h3>
            <p className="text-sm text-muted-foreground">
              Our team is here to help. Reach out anytime.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-2 rounded-xl"
              onClick={() => window.open("mailto:hello@orangedoormarketing.com", "_blank")}
            >
              <Mail className="h-4 w-4" />
              Email Us
            </Button>
            <Button
              variant="outline"
              className="gap-2 rounded-xl"
              onClick={() => onNavigate?.("meetings")}
              disabled={!onNavigate}
            >
              <Phone className="h-4 w-4" />
              Schedule Call
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
