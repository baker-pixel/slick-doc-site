import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight, Check, Zap, Star, Crown } from "lucide-react";


interface FeatureDetail {
  title: string;
  description: string;
}

interface PlanDetails {
  name: string;
  level: string;
  price: number;
  priceSuffix?: string;
  description: string;
  scoreRange: string;
  icon: typeof Zap;
  features: FeatureDetail[];
  popular: boolean;
}

const planDetails: Record<string, PlanDetails> = {
  "SYSTEM Foundation": {
    name: "SYSTEM Foundation",
    level: "Level I",
    price: 249,
    description: "For businesses with light-to-moderate gaps that need structure and optimization.",
    scoreRange: "65-100",
    icon: Zap,
    popular: false,
    features: [
      {
        title: "Website Conversion Tune-Up",
        description: "We audit your current website and implement quick-win optimizations to improve visitor-to-lead conversion. This includes fixing calls-to-action, improving page speed, and optimizing forms to capture more leads from your existing traffic."
      },
      {
        title: "Local Visibility Upgrade",
        description: "We optimize your Google Business Profile, ensure NAP (Name, Address, Phone) consistency across directories, and set up local citations to help you rank higher in local searches when potential customers are looking for your services nearby."
      },
      {
        title: "Basic SEO Cleanup",
        description: "We fix technical SEO issues like broken links, missing meta tags, slow-loading pages, and mobile responsiveness problems. This ensures search engines can properly crawl and index your site for relevant keywords."
      },
      {
        title: "Review Generation Setup",
        description: "We implement automated systems to request reviews from satisfied customers at the right moment. Includes email/SMS templates and timing strategies to maximize positive reviews on Google, Yelp, and industry-specific platforms."
      },
      {
        title: "Analytics & KPI Setup",
        description: "We configure Google Analytics 4, set up conversion tracking, and create custom dashboards so you can see exactly where your leads come from and which marketing channels deliver the best ROI."
      },
      {
        title: "Monthly Google Business Profile Posts",
        description: "We create and publish 4 posts per month to your Google Business Profile featuring updates, offers, and engaging content to keep your profile active and improve local search visibility."
      },
      {
        title: "1 Blog Article/Month",
        description: "We research, write, and publish one SEO-optimized blog article each month targeting keywords your ideal customers are searching for. Each article is designed to drive organic traffic and establish your expertise."
      },
      {
        title: "Quarterly SEO Tuning",
        description: "Every quarter, we analyze your SEO performance, research new keyword opportunities, update existing content, and adjust strategy based on what's working. This keeps your search rankings improving over time."
      }
    ]
  },
  "SYSTEM Growth": {
    name: "SYSTEM Growth",
    level: "Level II",
    price: 449,
    priceSuffix: "–549",
    description: "For SMBs with moderate gaps who need activation across multiple channels.",
    scoreRange: "40-64",
    icon: Star,
    popular: true,
    features: [
      {
        title: "Everything in Level I",
        description: "You get all the benefits of SYSTEM Foundation including website optimization, local visibility, SEO cleanup, review generation, analytics setup, Google Business posts, monthly blog content, and quarterly SEO tuning."
      },
      {
        title: "Landing Page Pack (3-5 pages)",
        description: "We design and build 3-5 high-converting landing pages tailored to specific services, offers, or audience segments. Each page is optimized for conversions with compelling copy, strategic design, and proper tracking."
      },
      {
        title: "Email & SMS Automation",
        description: "We set up automated nurture sequences that follow up with leads at the perfect time. Includes welcome series, abandoned inquiry recovery, appointment reminders, and re-engagement campaigns that work 24/7."
      },
      {
        title: "Retargeting Ads Setup",
        description: "We configure Facebook/Instagram and Google retargeting campaigns to bring back website visitors who didn't convert. These 'warm' audiences convert at 3-5x higher rates than cold traffic."
      },
      {
        title: "CRM Pipeline Optimization",
        description: "We audit and optimize your CRM setup to ensure no leads fall through the cracks. Includes pipeline stage configuration, automation rules, task assignments, and reporting dashboards."
      },
      {
        title: "2 Blogs/Month",
        description: "Double the content output with two SEO-optimized articles per month. More content means more keyword coverage, more organic traffic opportunities, and faster authority building in your industry."
      },
      {
        title: "Monthly SEO Optimization",
        description: "Instead of quarterly, we actively optimize your SEO every month. This includes content updates, new backlink opportunities, technical fixes, and adapting to algorithm changes faster."
      },
      {
        title: "Monthly Strategy Call",
        description: "A dedicated monthly video call with your strategist to review performance, discuss priorities, align on upcoming initiatives, and ensure your marketing stays connected to your business goals."
      }
    ]
  },
  "SYSTEM Transformation": {
    name: "SYSTEM Transformation",
    level: "Level III",
    price: 799,
    priceSuffix: "–999",
    description: "For businesses requiring a full rebuild of their digital infrastructure.",
    scoreRange: "0-39",
    icon: Crown,
    popular: false,
    features: [
      {
        title: "Everything in Level II",
        description: "You receive the complete SYSTEM Growth package including all Level I services, landing pages, email/SMS automation, retargeting, CRM optimization, 2 monthly blogs, monthly SEO, and strategy calls."
      },
      {
        title: "Full Website Rebuild",
        description: "We design and develop a completely new website from scratch. This includes custom design, conversion-optimized architecture, mobile responsiveness, fast loading speeds, and integration with your marketing stack."
      },
      {
        title: "Advanced SEO Program",
        description: "Enterprise-level SEO including comprehensive keyword strategy, content clusters, technical optimization, link building campaigns, and competitor analysis. We target high-value keywords that drive qualified leads."
      },
      {
        title: "Lead Magnet Development",
        description: "We create valuable downloadable resources (guides, checklists, templates, calculators) that attract your ideal customers. Includes the content creation, design, landing page, and email sequence."
      },
      {
        title: "Full Funnel Buildout",
        description: "We architect your complete customer journey from first touch to purchase. This includes awareness content, consideration nurturing, decision triggers, and post-purchase sequences all working together."
      },
      {
        title: "Sales Enablement System",
        description: "We create tools that help you close deals: proposal templates, case studies, comparison sheets, objection-handling guides, and automated follow-up sequences that support your sales conversations."
      },
      {
        title: "Retention Engine Setup",
        description: "We build systems to keep customers coming back: loyalty programs, referral incentives, re-engagement campaigns, satisfaction surveys, and automated touchpoints that maximize customer lifetime value."
      },
      {
        title: "Full Analytics Suite",
        description: "Complete visibility into your marketing performance with custom dashboards, attribution modeling, ROI tracking, predictive analytics, and automated reporting that shows exactly what's working."
      }
    ]
  }
};

interface PricingTierModalProps {
  planName: string | null;
  onClose: () => void;
  onGetStarted?: (planName: string) => void;
}

export function PricingTierModal({ planName, onClose, onGetStarted }: PricingTierModalProps) {
  const plan = planName ? planDetails[planName] : null;

  if (!plan) return null;

  const IconComponent = plan.icon;

  return (
    <Dialog open={!!planName} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border bg-background z-10 shrink-0">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              plan.popular ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
            }`}>
              <IconComponent size={24} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs">{plan.level}</Badge>
                {plan.popular && (
                  <Badge className="bg-primary text-primary-foreground text-xs">Most Popular</Badge>
                )}
              </div>
              <DialogTitle className="text-xl font-display">{plan.name}</DialogTitle>
            </div>
            <div className="text-right">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-foreground">${plan.price}</span>
                {plan.priceSuffix && (
                  <span className="text-lg text-muted-foreground">{plan.priceSuffix}</span>
                )}
                <span className="text-sm text-muted-foreground">/mo</span>
              </div>
              <p className="text-xs text-muted-foreground">Score: {plan.scoreRange}</p>
            </div>
          </div>
          <DialogDescription className="mt-2">{plan.description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-6 space-y-4">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              What's Included
            </h4>
            {plan.features.map((feature, index) => (
              <div 
                key={index} 
                className="p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
              >
                <div className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-medium text-foreground mb-1">{feature.title}</h5>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 pt-4 border-t border-border bg-background shrink-0">
          <Button 
            size="lg" 
            className="w-full" 
            onClick={() => onGetStarted ? onGetStarted(plan.name) : null}
          >
            Get Started with {plan.name}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
