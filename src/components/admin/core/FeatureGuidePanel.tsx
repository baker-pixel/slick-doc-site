import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  Activity, 
  Bell, 
  Zap, 
  CalendarIcon, 
  BarChart3, 
  Users, 
  Send, 
  FileText, 
  Mail, 
  Briefcase, 
  Bot, 
  Target, 
  Star, 
  Megaphone,
  Rocket,
  Link2,
  ListChecks,
  Trophy,
  BookOpen,
  HeartPulse,
  Wand2,
  ShieldCheck,
  GitCompare,
  FileSpreadsheet,
  Brain,
  List,
  ClipboardCheck,
  FileCheck,
  Settings,
  FolderOpen,
  MessageCircle,
  CalendarCheck,
  Palette,
  UserCircle,
  FileSignature,
  Receipt
} from "lucide-react";

interface FeatureInfo {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  category: "overview" | "leads" | "email" | "automation" | "client-management";
  description: string;
  capabilities: string[];
  useCases: string[];
  status: "active" | "beta" | "coming-soon";
}

const features: FeatureInfo[] = [
  // Overview
  {
    id: "pipeline",
    name: "Pipeline Dashboard",
    icon: Activity,
    category: "overview",
    description: "Visual overview of your sales pipeline with drag-and-drop lead management across customizable stages.",
    capabilities: [
      "Drag-and-drop lead management",
      "Customizable pipeline stages",
      "Lead value tracking",
      "Stage conversion analytics"
    ],
    useCases: [
      "Track leads from initial contact to closed deal",
      "Identify bottlenecks in your sales process",
      "Forecast revenue based on pipeline value"
    ],
    status: "active"
  },
  {
    id: "alerts",
    name: "Automation Alerts",
    icon: Bell,
    category: "overview",
    description: "Real-time notifications for automation failures, system issues, and important events requiring attention.",
    capabilities: [
      "Real-time alert notifications",
      "Severity-based categorization",
      "Acknowledgment tracking",
      "Alert history and patterns"
    ],
    useCases: [
      "Monitor automation job failures",
      "Track system health issues",
      "Stay informed of critical business events"
    ],
    status: "active"
  },
  {
    id: "quick-actions",
    name: "Quick Actions",
    icon: Zap,
    category: "overview",
    description: "One-click access to common tasks and frequently used operations across the admin panel.",
    capabilities: [
      "Shortcut buttons for common tasks",
      "Quick client creation",
      "Fast email sending",
      "Rapid content scheduling"
    ],
    useCases: [
      "Speed up daily administrative tasks",
      "Reduce clicks for repetitive actions",
      "Improve team efficiency"
    ],
    status: "active"
  },
  {
    id: "calendar",
    name: "Content Calendar",
    icon: CalendarIcon,
    category: "overview",
    description: "Visual calendar for planning, scheduling, and managing content across all clients and platforms.",
    capabilities: [
      "Drag-and-drop scheduling",
      "Multi-platform content planning",
      "Publishing automation",
      "Content status tracking"
    ],
    useCases: [
      "Plan social media content weeks ahead",
      "Coordinate blog post releases",
      "Manage client content approvals"
    ],
    status: "active"
  },
  {
    id: "analytics",
    name: "Analytics Dashboard",
    icon: BarChart3,
    category: "overview",
    description: "Comprehensive analytics showing leads, conversions, and business performance metrics.",
    capabilities: [
      "Lead source tracking",
      "Conversion rate analysis",
      "Time-based comparisons",
      "Custom report generation"
    ],
    useCases: [
      "Measure marketing campaign effectiveness",
      "Track business growth trends",
      "Make data-driven decisions"
    ],
    status: "active"
  },
  {
    id: "activity-feed",
    name: "Activity Feed",
    icon: List,
    category: "overview",
    description: "Real-time stream of all activities across clients, showing messages, meetings, deliverables, and more.",
    capabilities: [
      "Chronological activity stream",
      "Client-specific filtering",
      "Activity type categorization",
      "Quick action links"
    ],
    useCases: [
      "Stay updated on client interactions",
      "Review recent team activities",
      "Quickly find recent changes"
    ],
    status: "active"
  },
  
  // Leads
  {
    id: "contacts",
    name: "Contacts",
    icon: Users,
    category: "leads",
    description: "Manage all contact form submissions with filtering, status tracking, and bulk operations.",
    capabilities: [
      "Contact list management",
      "Status tracking (new, contacted, converted)",
      "Bulk actions",
      "Export functionality"
    ],
    useCases: [
      "Follow up with website inquiries",
      "Track lead progression",
      "Manage contact database"
    ],
    status: "active"
  },
  {
    id: "gap-analysis",
    name: "Gap Analysis",
    icon: FileText,
    category: "leads",
    description: "View and analyze comprehensive gap analysis submissions from prospects to identify their marketing needs.",
    capabilities: [
      "Detailed submission viewing",
      "AI-powered analysis insights",
      "Score-based prioritization",
      "Proposal generation integration"
    ],
    useCases: [
      "Understand prospect pain points",
      "Identify service opportunities",
      "Create targeted proposals"
    ],
    status: "active"
  },
  {
    id: "pdf-leads",
    name: "PDF Leads",
    icon: Mail,
    category: "leads",
    description: "Track leads captured through PDF downloads and lead magnets.",
    capabilities: [
      "Download tracking",
      "Source attribution",
      "Automated follow-up triggers",
      "Lead magnet performance"
    ],
    useCases: [
      "Nurture content leads",
      "Measure lead magnet effectiveness",
      "Build email lists"
    ],
    status: "active"
  },
  {
    id: "lead-scoring",
    name: "AI Lead Scoring",
    icon: Brain,
    category: "leads",
    description: "Automatically score and prioritize leads based on urgency, budget signals, keywords, sentiment, and conversion probability.",
    capabilities: [
      "AI-powered scoring algorithm",
      "Multi-factor analysis",
      "Priority ranking",
      "Conversion probability predictions"
    ],
    useCases: [
      "Focus on highest-value prospects",
      "Prioritize sales team efforts",
      "Identify hot leads automatically"
    ],
    status: "active"
  },
  
  // Email
  {
    id: "emails",
    name: "Client Outreach",
    icon: Send,
    category: "email",
    description: "Tracks the outreach emails clients send to their own prospects (the drip sequence run on their behalf) -- not Orange Door's own marketing email.",
    capabilities: [
      "Per-client outreach queue and sent history",
      "Open and click analytics",
      "Deliverability monitoring",
      "Bounce management"
    ],
    useCases: [
      "Check a client's outreach progress",
      "Track engagement metrics for a client's prospects",
      "Manage sending list health"
    ],
    status: "active"
  },
  {
    id: "templates",
    name: "Email Templates",
    icon: FileText,
    category: "email",
    description: "Create and manage reusable email templates with dynamic variables for personalization.",
    capabilities: [
      "Template builder with variables",
      "Category organization",
      "Preview functionality",
      "Version history"
    ],
    useCases: [
      "Standardize client communications",
      "Speed up email composition",
      "Ensure brand consistency"
    ],
    status: "active"
  },
  {
    id: "sequences",
    name: "Marketing Sequences",
    icon: Mail,
    category: "email",
    description: "Build Orange Door's own automated nurture sequences, triggered by actions like form submissions or downloads -- separate from the Outreach Sequence clients' prospects go through.",
    capabilities: [
      "Multi-step sequences",
      "Trigger-based automation",
      "Delay scheduling",
      "A/B testing"
    ],
    useCases: [
      "Nurture leads automatically",
      "Onboard new clients",
      "Re-engage inactive contacts"
    ],
    status: "active"
  },
  {
    id: "campaigns",
    name: "Campaigns",
    icon: Send,
    category: "email",
    description: "Send bulk email campaigns to targeted contact lists with tracking and analytics.",
    capabilities: [
      "Bulk email sending",
      "List segmentation",
      "Campaign analytics",
      "Scheduling options"
    ],
    useCases: [
      "Send newsletters",
      "Announce promotions",
      "Share company updates"
    ],
    status: "active"
  },
  
  // Automation
  {
    id: "onboarding",
    name: "Client Onboarding",
    icon: Rocket,
    category: "automation",
    description: "Automated client onboarding workflows that guide new clients through setup steps.",
    capabilities: [
      "Step-by-step onboarding flows",
      "Progress tracking",
      "Automated reminders",
      "Checklist management"
    ],
    useCases: [
      "Streamline new client setup",
      "Ensure consistent onboarding",
      "Reduce manual follow-ups"
    ],
    status: "active"
  },
  {
    id: "task-templates",
    name: "Task Templates",
    icon: ListChecks,
    category: "automation",
    description: "Create reusable task templates that automatically generate tasks for new clients based on their tier.",
    capabilities: [
      "Tier-based task assignment",
      "Template customization",
      "Automation type settings",
      "Order management"
    ],
    useCases: [
      "Standardize client deliverables",
      "Automate task creation",
      "Ensure nothing is missed"
    ],
    status: "active"
  },
  {
    id: "automation",
    name: "Automation Jobs",
    icon: Bot,
    category: "automation",
    description: "Monitor and manage AI-powered automation jobs including content generation and report creation.",
    capabilities: [
      "Job status monitoring",
      "Error tracking",
      "Output viewing",
      "Manual job triggering"
    ],
    useCases: [
      "Monitor automated workflows",
      "Debug failed automations",
      "Review AI outputs"
    ],
    status: "active"
  },
  {
    id: "integrations",
    name: "Integrations",
    icon: Link2,
    category: "automation",
    description: "Configure and manage third-party integrations like Google Analytics, Search Console, and more.",
    capabilities: [
      "API key management",
      "Integration settings",
      "Connection testing",
      "Per-client configuration"
    ],
    useCases: [
      "Connect client accounts",
      "Pull external data",
      "Enable advanced features"
    ],
    status: "active"
  },
  {
    id: "seo-dashboard",
    name: "SEO Dashboard",
    icon: BarChart3,
    category: "automation",
    description: "Real-time SEO analysis showing scores, readability, keyword targeting, backlink potential, and technical issues with one-click fixes.",
    capabilities: [
      "Page-by-page SEO scoring",
      "Readability analysis",
      "Keyword optimization",
      "Technical issue detection",
      "AI-generated content rewrites"
    ],
    useCases: [
      "Audit client websites",
      "Identify SEO opportunities",
      "Generate optimization recommendations"
    ],
    status: "active"
  },
  {
    id: "marketing-os",
    name: "Marketing OS",
    icon: Target,
    category: "automation",
    description: "Unified dashboard combining website analytics, SEO tracking, competitor insights, social performance, lead tracking, and AI recommendations.",
    capabilities: [
      "Multi-source data aggregation",
      "AI-powered insights",
      "Automated action items",
      "Performance benchmarking"
    ],
    useCases: [
      "Get a complete marketing overview",
      "Identify growth opportunities",
      "Make data-driven decisions"
    ],
    status: "active"
  },
  {
    id: "review-engine",
    name: "Review Engine",
    icon: Star,
    category: "automation",
    description: "Automated Google review management including request sequences, AI-written responses, sentiment analysis, and reputation tracking.",
    capabilities: [
      "Review request automation",
      "AI response generation",
      "Sentiment analysis",
      "Reputation scoring"
    ],
    useCases: [
      "Grow client review counts",
      "Respond to reviews quickly",
      "Monitor reputation trends"
    ],
    status: "active"
  },
  {
    id: "win-notifications",
    name: "Win Notifications",
    icon: Trophy,
    category: "automation",
    description: "Automated client notifications for wins like ranking improvements, traffic increases, and cost-per-lead decreases.",
    capabilities: [
      "Automated win detection",
      "Customizable thresholds",
      "Multi-channel notifications",
      "Win history tracking"
    ],
    useCases: [
      "Celebrate client successes",
      "Build client relationships",
      "Demonstrate value proactively"
    ],
    status: "active"
  },
  {
    id: "ad-generator",
    name: "AI Ad Generator",
    icon: Megaphone,
    category: "automation",
    description: "Generate complete ad campaigns for Meta and Google including headlines, descriptions, images, video scripts, and landing page copy.",
    capabilities: [
      "Multi-platform ad generation",
      "Audience targeting suggestions",
      "Landing page copy",
      "Visual asset recommendations"
    ],
    useCases: [
      "Create ads in minutes",
      "Test multiple variations",
      "Scale ad production"
    ],
    status: "active"
  },
  {
    id: "case-studies",
    name: "Case Study Builder",
    icon: BookOpen,
    category: "automation",
    description: "Build compelling case studies from client data with AI-generated narratives and results visualization.",
    capabilities: [
      "AI narrative generation",
      "Results visualization",
      "Template-based creation",
      "Export options"
    ],
    useCases: [
      "Create sales materials",
      "Document client successes",
      "Build portfolio"
    ],
    status: "active"
  },
  {
    id: "client-health",
    name: "Client Health Dashboard",
    icon: HeartPulse,
    category: "automation",
    description: "Monitor overall client health with engagement scores, risk indicators, and proactive intervention alerts.",
    capabilities: [
      "Health score calculation",
      "Churn risk detection",
      "Engagement tracking",
      "Intervention recommendations"
    ],
    useCases: [
      "Identify at-risk clients",
      "Prioritize client attention",
      "Reduce churn"
    ],
    status: "active"
  },
  {
    id: "website-personalization",
    name: "Website Personalization",
    icon: Wand2,
    category: "automation",
    description: "Create dynamic content rules that change website elements based on visitor type (new/returning, local/out-of-town, past buyer, engaged scroller).",
    capabilities: [
      "Visitor segmentation",
      "Dynamic content rules",
      "A/B testing integration",
      "Embed code generation"
    ],
    useCases: [
      "Personalize client websites",
      "Increase conversion rates",
      "Deliver relevant experiences"
    ],
    status: "active"
  },
  {
    id: "quality-assurance",
    name: "AI Quality Assurance",
    icon: ShieldCheck,
    category: "automation",
    description: "Automated QA checks for broken links, spelling/grammar, missing metadata, mobile layout issues, accessibility problems, and load times.",
    capabilities: [
      "Automated site scanning",
      "Issue categorization",
      "Fix suggestions",
      "Scheduled audits"
    ],
    useCases: [
      "Catch issues before clients do",
      "Maintain quality standards",
      "Speed up QA process"
    ],
    status: "active"
  },
  {
    id: "before-after",
    name: "Before & After Showcase",
    icon: GitCompare,
    category: "automation",
    description: "Create visual before/after comparisons of client websites with screenshots, stats, and improvement highlights.",
    capabilities: [
      "Screenshot comparison",
      "Stat visualization",
      "Improvement tracking",
      "Public/private sharing"
    ],
    useCases: [
      "Create sales materials",
      "Document project impact",
      "Build client confidence"
    ],
    status: "active"
  },
  {
    id: "sales-proposals",
    name: "AI Sales Proposals",
    icon: FileSpreadsheet,
    category: "automation",
    description: "Generate complete sales proposals with industry analysis, sample designs, ROI projections, timelines, and pricing breakdowns.",
    capabilities: [
      "AI proposal generation",
      "Industry-specific analysis",
      "ROI calculations",
      "Custom pricing"
    ],
    useCases: [
      "Close deals faster",
      "Create professional proposals",
      "Standardize sales process"
    ],
    status: "active"
  },
  
  // Client Management
  {
    id: "clients",
    name: "Client Management",
    icon: Briefcase,
    category: "client-management",
    description: "Central hub for managing all client accounts, tiers, and contact information.",
    capabilities: [
      "Client CRUD operations",
      "Tier management",
      "Contact information",
      "Status tracking"
    ],
    useCases: [
      "Manage client roster",
      "Track client details",
      "Organize by tier"
    ],
    status: "active"
  },
  {
    id: "client-projects",
    name: "Client Projects",
    icon: Target,
    category: "client-management",
    description: "Track projects, milestones, and progress for each client.",
    capabilities: [
      "Project tracking",
      "Milestone management",
      "Progress visualization",
      "Timeline management"
    ],
    useCases: [
      "Manage client work",
      "Track deliverables",
      "Monitor timelines"
    ],
    status: "active"
  },
  {
    id: "client-analytics",
    name: "Client Analytics",
    icon: BarChart3,
    category: "client-management",
    description: "Per-client analytics and performance metrics.",
    capabilities: [
      "Client-specific metrics",
      "Period comparisons",
      "Highlight tracking",
      "Report generation"
    ],
    useCases: [
      "Track client performance",
      "Generate client reports",
      "Identify trends"
    ],
    status: "active"
  },
  {
    id: "deliverables",
    name: "Deliverables",
    icon: FileCheck,
    category: "client-management",
    description: "Manage client deliverables with approval workflows and revision tracking.",
    capabilities: [
      "File management",
      "Approval workflows",
      "Revision tracking",
      "Feedback collection"
    ],
    useCases: [
      "Deliver work to clients",
      "Track approvals",
      "Manage revisions"
    ],
    status: "active"
  },
  {
    id: "content-review",
    name: "Content Review",
    icon: ClipboardCheck,
    category: "client-management",
    description: "Review and approve content before it goes live.",
    capabilities: [
      "Content preview",
      "Approval workflows",
      "Feedback collection",
      "Version comparison"
    ],
    useCases: [
      "QA content before publishing",
      "Collect client feedback",
      "Ensure quality standards"
    ],
    status: "active"
  },
  {
    id: "sops",
    name: "SOP Management",
    icon: FileCheck,
    category: "client-management",
    description: "Create and manage Standard Operating Procedures for consistent service delivery.",
    capabilities: [
      "SOP creation and editing",
      "Version control",
      "Team access",
      "AI parsing"
    ],
    useCases: [
      "Document processes",
      "Train team members",
      "Ensure consistency"
    ],
    status: "active"
  },
  {
    id: "settings",
    name: "Admin Settings",
    icon: Settings,
    category: "client-management",
    description: "Configure system-wide settings including passwords, defaults, and preferences.",
    capabilities: [
      "Password management",
      "System configuration",
      "Default settings",
      "Integration keys"
    ],
    useCases: [
      "Manage admin access",
      "Configure system behavior",
      "Update settings"
    ],
    status: "active"
  }
];

const categoryLabels: Record<string, string> = {
  overview: "Overview",
  leads: "Leads & Contacts",
  email: "Email Marketing",
  automation: "Automation & AI",
  "client-management": "Client Management"
};

const categoryColors: Record<string, string> = {
  overview: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  leads: "bg-green-500/10 text-green-500 border-green-500/20",
  email: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  automation: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  "client-management": "bg-pink-500/10 text-pink-500 border-pink-500/20"
};

interface FeatureGuidePanelProps {
  onNavigate?: (section: string) => void;
}

export default function FeatureGuidePanel({ onNavigate }: FeatureGuidePanelProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const filteredFeatures = features.filter(feature => {
    const matchesSearch = search === "" || 
      feature.name.toLowerCase().includes(search.toLowerCase()) ||
      feature.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === "all" || feature.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ["all", "overview", "leads", "email", "automation", "client-management"];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Feature Guide
          </CardTitle>
          <CardDescription>
            Learn about all the automation and management features available in the Orange Door Marketing OS
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search features..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Tabs value={activeCategory} onValueChange={setActiveCategory}>
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="all">All ({features.length})</TabsTrigger>
              {categories.slice(1).map(cat => (
                <TabsTrigger key={cat} value={cat}>
                  {categoryLabels[cat]} ({features.filter(f => f.category === cat).length})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {filteredFeatures.map((feature) => (
          <Card key={feature.id} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${categoryColors[feature.category]}`}>
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{feature.name}</CardTitle>
                    <Badge variant="outline" className="mt-1 text-xs">
                      {categoryLabels[feature.category]}
                    </Badge>
                  </div>
                </div>
                {feature.status === "beta" && (
                  <Badge variant="secondary">Beta</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{feature.description}</p>
              
              <div>
                <h4 className="text-sm font-medium mb-2">Capabilities</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {feature.capabilities.map((cap, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      {cap}
                    </li>
                  ))}
                </ul>
              </div>
              
              <div>
                <h4 className="text-sm font-medium mb-2">Use Cases</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {feature.useCases.map((useCase, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      {useCase}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
            {feature.id !== "feature-guide" && onNavigate && (
              <CardFooter className="pt-0">
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => onNavigate(feature.id)}
                >
                  Go to {feature.name}
                </Button>
              </CardFooter>
            )}
          </Card>
        ))}
      </div>

      {filteredFeatures.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No features found matching your search.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
