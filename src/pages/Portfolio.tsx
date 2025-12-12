import { motion } from "framer-motion";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { 
  ArrowRight, 
  TrendingUp, 
  Users, 
  Star, 
  Globe, 
  Phone, 
  Mail,
  MapPin,
  ExternalLink,
  BarChart3,
  Target,
  Zap
} from "lucide-react";

interface PortfolioProject {
  id: string;
  businessName: string;
  industry: string;
  location: string;
  description: string;
  services: string[];
  results: {
    metric: string;
    value: string;
    improvement: string;
  }[];
  testimonial?: {
    quote: string;
    author: string;
    role: string;
  };
  image: string;
  featured: boolean;
}

const portfolioProjects: PortfolioProject[] = [
  {
    id: "1",
    businessName: "Knox Plumbing Pros",
    industry: "Home Services",
    location: "Knoxville, TN",
    description: "Family-owned plumbing company serving the greater Knoxville area for over 20 years. We helped them modernize their digital presence and dominate local search.",
    services: ["Local SEO", "Google Business Profile", "Paid Ads", "Website Redesign"],
    results: [
      { metric: "Organic Traffic", value: "340%", improvement: "increase" },
      { metric: "Phone Calls", value: "185%", improvement: "increase" },
      { metric: "Cost Per Lead", value: "42%", improvement: "decrease" },
    ],
    testimonial: {
      quote: "Orange Door transformed our business. We went from struggling to find new customers to having more work than we can handle.",
      author: "Mike Thompson",
      role: "Owner"
    },
    image: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&auto=format&fit=crop",
    featured: true
  },
  {
    id: "2",
    businessName: "Smoky Mountain Dental",
    industry: "Healthcare",
    location: "Maryville, TN",
    description: "Modern dental practice focused on family dentistry. We built a comprehensive marketing system that filled their appointment calendar.",
    services: ["Content Marketing", "Social Media", "Email Automation", "Review Management"],
    results: [
      { metric: "New Patients", value: "78", improvement: "per month" },
      { metric: "Google Reviews", value: "4.9", improvement: "star rating" },
      { metric: "Website Leads", value: "225%", improvement: "increase" },
    ],
    testimonial: {
      quote: "The team at Orange Door understands healthcare marketing. Our practice has grown beyond what we thought possible.",
      author: "Dr. Sarah Chen",
      role: "Practice Owner"
    },
    image: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800&auto=format&fit=crop",
    featured: true
  },
  {
    id: "3",
    businessName: "Tennessee Valley Roofing",
    industry: "Construction",
    location: "Knoxville, TN",
    description: "Commercial and residential roofing contractor. We implemented a lead generation system that consistently delivers high-quality roofing leads.",
    services: ["Google Ads", "Landing Pages", "CRM Integration", "Call Tracking"],
    results: [
      { metric: "Qualified Leads", value: "156%", improvement: "increase" },
      { metric: "Revenue", value: "$1.2M", improvement: "added annually" },
      { metric: "Close Rate", value: "35%", improvement: "up from 18%" },
    ],
    image: "https://images.unsplash.com/photo-1632759145351-1d592919f522?w=800&auto=format&fit=crop",
    featured: false
  },
  {
    id: "4",
    businessName: "Old City Fitness",
    industry: "Health & Wellness",
    location: "Knoxville, TN",
    description: "Boutique gym in the heart of Old City. We created a membership growth strategy that doubled their member base in 8 months.",
    services: ["Social Media Marketing", "Local SEO", "Referral Program", "Email Campaigns"],
    results: [
      { metric: "Memberships", value: "112%", improvement: "increase" },
      { metric: "Social Followers", value: "8.5K", improvement: "gained" },
      { metric: "Retention Rate", value: "89%", improvement: "up from 67%" },
    ],
    testimonial: {
      quote: "They don't just run ads - they build systems. Our gym runs itself now.",
      author: "Jason Martinez",
      role: "Founder"
    },
    image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop",
    featured: false
  },
  {
    id: "5",
    businessName: "Volunteer HVAC",
    industry: "Home Services",
    location: "Powell, TN",
    description: "Full-service HVAC company specializing in residential installations. We optimized their digital marketing to generate consistent year-round leads.",
    services: ["SEO", "Google Ads", "Reputation Management", "Website Optimization"],
    results: [
      { metric: "Service Calls", value: "210%", improvement: "increase" },
      { metric: "Average Ticket", value: "$840", improvement: "up from $520" },
      { metric: "5-Star Reviews", value: "247", improvement: "new reviews" },
    ],
    image: "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&auto=format&fit=crop",
    featured: false
  },
  {
    id: "6",
    businessName: "Lakeside Legal Group",
    industry: "Professional Services",
    location: "Farragut, TN",
    description: "Family law and estate planning firm. We positioned them as the go-to firm in West Knoxville through strategic content and local optimization.",
    services: ["Content Strategy", "Local SEO", "PPC Management", "Conversion Optimization"],
    results: [
      { metric: "Case Inquiries", value: "185%", improvement: "increase" },
      { metric: "Organic Rankings", value: "#1", improvement: "for 12 keywords" },
      { metric: "Cost Per Case", value: "58%", improvement: "decrease" },
    ],
    image: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800&auto=format&fit=crop",
    featured: true
  },
];

const industries = ["All", "Home Services", "Healthcare", "Construction", "Health & Wellness", "Professional Services"];

export default function Portfolio() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-secondary/50 to-background" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        
        <div className="container-wide mx-auto px-4 md:px-8 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-4xl mx-auto"
          >
            <Badge variant="secondary" className="mb-4 text-sm px-4 py-1">
              <MapPin className="w-3 h-3 mr-1" />
              Proudly Serving East Tennessee
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-foreground mb-6">
              Real Results for{" "}
              <span className="text-primary">Real Businesses</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              See how we've helped local businesses in Knoxville and the surrounding areas 
              grow their revenue, dominate their markets, and build sustainable marketing systems.
            </p>
            
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto mt-12">
              {[
                { icon: Users, value: "50+", label: "Happy Clients" },
                { icon: TrendingUp, value: "185%", label: "Avg. Growth" },
                { icon: Star, value: "4.9", label: "Client Rating" },
                { icon: Target, value: "$8.2M", label: "Revenue Generated" },
              ].map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + index * 0.1 }}
                  className="text-center"
                >
                  <stat.icon className="w-6 h-6 text-primary mx-auto mb-2" />
                  <div className="text-2xl md:text-3xl font-bold text-foreground">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Featured Projects */}
      <section className="py-16 md:py-24">
        <div className="container-wide mx-auto px-4 md:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
              Featured Success Stories
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Deep dives into our most impactful client partnerships and the strategies that drove their growth.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            {portfolioProjects.filter(p => p.featured).slice(0, 2).map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15 }}
              >
                <Card className="overflow-hidden h-full hover:shadow-xl transition-all duration-300 group border-border/50">
                  <div className="relative h-64 overflow-hidden">
                    <img
                      src={project.image}
                      alt={project.businessName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <Badge className="bg-primary text-primary-foreground mb-2">
                        {project.industry}
                      </Badge>
                      <h3 className="text-2xl font-display font-bold text-foreground">
                        {project.businessName}
                      </h3>
                      <div className="flex items-center gap-1 text-muted-foreground text-sm mt-1">
                        <MapPin className="w-3 h-3" />
                        {project.location}
                      </div>
                    </div>
                  </div>
                  
                  <CardContent className="p-6">
                    <p className="text-muted-foreground mb-6">{project.description}</p>
                    
                    {/* Services */}
                    <div className="flex flex-wrap gap-2 mb-6">
                      {project.services.map((service) => (
                        <Badge key={service} variant="secondary" className="text-xs">
                          {service}
                        </Badge>
                      ))}
                    </div>

                    {/* Results */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      {project.results.map((result) => (
                        <div key={result.metric} className="text-center p-3 bg-secondary/50 rounded-lg">
                          <div className="text-xl font-bold text-primary">{result.value}</div>
                          <div className="text-xs text-muted-foreground">{result.metric}</div>
                        </div>
                      ))}
                    </div>

                    {/* Testimonial */}
                    {project.testimonial && (
                      <blockquote className="border-l-2 border-primary pl-4 italic text-muted-foreground">
                        "{project.testimonial.quote}"
                        <footer className="mt-2 text-sm font-medium text-foreground not-italic">
                          — {project.testimonial.author}, {project.testimonial.role}
                        </footer>
                      </blockquote>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* All Projects Grid */}
      <section className="py-16 md:py-24 bg-secondary/30">
        <div className="container-wide mx-auto px-4 md:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
              More Client Wins
            </h2>
            <p className="text-muted-foreground text-lg">
              A snapshot of the businesses we've helped transform.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {portfolioProjects.filter(p => !p.featured || portfolioProjects.filter(x => x.featured).indexOf(p) >= 2).map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="overflow-hidden h-full hover:shadow-lg transition-all duration-300 group bg-card border-border/50">
                  <div className="relative h-48 overflow-hidden">
                    <img
                      src={project.image}
                      alt={project.businessName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-3 left-3">
                      <Badge variant="secondary" className="bg-background/90 backdrop-blur-sm">
                        {project.industry}
                      </Badge>
                    </div>
                  </div>
                  
                  <CardContent className="p-5">
                    <h3 className="text-lg font-display font-bold text-foreground mb-1">
                      {project.businessName}
                    </h3>
                    <div className="flex items-center gap-1 text-muted-foreground text-sm mb-4">
                      <MapPin className="w-3 h-3" />
                      {project.location}
                    </div>

                    {/* Key Result */}
                    <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/10">
                      <Zap className="w-5 h-5 text-primary flex-shrink-0" />
                      <div>
                        <span className="font-bold text-primary">{project.results[0].value}</span>
                        <span className="text-sm text-muted-foreground ml-1">
                          {project.results[0].improvement} in {project.results[0].metric}
                        </span>
                      </div>
                    </div>

                    {project.testimonial && (
                      <p className="mt-4 text-sm text-muted-foreground italic line-clamp-2">
                        "{project.testimonial.quote}"
                      </p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24">
        <div className="container-wide mx-auto px-4 md:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center max-w-3xl mx-auto"
          >
            <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
              Ready to Be Our Next Success Story?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Let's discuss how we can help your business achieve similar results. 
              Start with a free gap analysis to identify your biggest growth opportunities.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/gap-analysis">
                <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  Get Your Free Gap Analysis
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Link to="/schedule">
                <Button size="lg" variant="outline">
                  Schedule a Call
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
