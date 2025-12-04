import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef, useState } from "react";
import { ArrowRight, Mail, Phone, MapPin, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

const contactSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(50, "First name must be less than 50 characters"),
  lastName: z.string().trim().min(1, "Last name is required").max(50, "Last name must be less than 50 characters"),
  businessName: z.string().trim().min(1, "Business name is required").max(100, "Business name must be less than 100 characters"),
  email: z.string().trim().email("Please enter a valid email address").max(255, "Email must be less than 255 characters"),
  websiteUrl: z.string().trim().url("Please enter a valid URL").optional().or(z.literal("")),
  marketingChallenge: z.string().trim().max(1000, "Message must be less than 1000 characters").optional(),
});

type ContactFormData = z.infer<typeof contactSchema>;

export function Contact() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormData, string>>>({});
  
  const [formData, setFormData] = useState<ContactFormData>({
    firstName: "",
    lastName: "",
    businessName: "",
    email: "",
    websiteUrl: "",
    marketingChallenge: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name as keyof ContactFormData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validate form data
    const result = contactSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ContactFormData, string>> = {};
      result.error.errors.forEach((error) => {
        const field = error.path[0] as keyof ContactFormData;
        fieldErrors[field] = error.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("contact_submissions")
        .insert({
          first_name: result.data.firstName,
          last_name: result.data.lastName,
          business_name: result.data.businessName,
          email: result.data.email,
          website_url: result.data.websiteUrl || null,
          marketing_challenge: result.data.marketingChallenge || null,
        });

      if (error) throw error;

      // Queue the contact form email sequence
      try {
        await supabase.functions.invoke("queue-sequence-emails", {
          body: {
            triggerType: "contact_form",
            recipientEmail: result.data.email,
            recipientName: result.data.firstName,
            data: {
              businessName: result.data.businessName,
              websiteUrl: result.data.websiteUrl,
              marketingChallenge: result.data.marketingChallenge,
            },
          },
        });
      } catch (emailError) {
        console.error("Failed to queue contact email sequence:", emailError);
        // Don't fail submission if email queueing fails
      }

      setIsSubmitted(true);
      toast({
        title: "Request Submitted!",
        description: "We'll review your information and get back to you within 24-48 hours.",
      });
    } catch (error) {
      toast({
        title: "Submission Failed",
        description: "Something went wrong. Please try again or email us directly.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="contact" className="section-padding bg-accent text-accent-foreground">
      <div className="container-wide mx-auto" ref={ref}>
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20">
          {/* CTA Content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold mb-6">
              Ready to Stop Guessing and{" "}
              <span className="text-primary">Start Growing?</span>
            </h2>
            <p className="text-accent-foreground/70 text-lg mb-8 leading-relaxed">
              Get your free SYSTEM Gap Analysis. We&apos;ll audit your digital
              presence, identify your biggest opportunities, and show you exactly
              how to level up your marketing.
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Mail className="text-primary" size={20} />
                </div>
                <span className="text-accent-foreground/90">
                  hello@orangedoor.marketing
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Phone className="text-primary" size={20} />
                </div>
                <span className="text-accent-foreground/90">(865) 555-DOOR</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <MapPin className="text-primary" size={20} />
                </div>
                <span className="text-accent-foreground/90">
                  Knoxville, Tennessee
                </span>
              </div>
            </div>
          </motion.div>

          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-card rounded-2xl p-8 text-card-foreground"
          >
            {isSubmitted ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
                  <CheckCircle className="text-emerald-600" size={32} />
                </div>
                <h3 className="text-2xl font-display font-semibold mb-3">
                  Thank You!
                </h3>
                <p className="text-muted-foreground max-w-sm">
                  Your Gap Analysis request has been submitted. We&apos;ll review your
                  information and reach out within 24-48 hours.
                </p>
              </div>
            ) : (
              <>
                <h3 className="text-2xl font-display font-semibold mb-6">
                  Get Your Free Gap Analysis
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        First Name <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        name="firstName"
                        value={formData.firstName}
                        onChange={handleChange}
                        className={`w-full px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                          errors.firstName ? "border-destructive" : "border-border"
                        }`}
                        placeholder="John"
                      />
                      {errors.firstName && (
                        <p className="text-xs text-destructive mt-1">{errors.firstName}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Last Name <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        name="lastName"
                        value={formData.lastName}
                        onChange={handleChange}
                        className={`w-full px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                          errors.lastName ? "border-destructive" : "border-border"
                        }`}
                        placeholder="Smith"
                      />
                      {errors.lastName && (
                        <p className="text-xs text-destructive mt-1">{errors.lastName}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Business Name <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      name="businessName"
                      value={formData.businessName}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                        errors.businessName ? "border-destructive" : "border-border"
                      }`}
                      placeholder="Your Business LLC"
                    />
                    {errors.businessName && (
                      <p className="text-xs text-destructive mt-1">{errors.businessName}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Email Address <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                        errors.email ? "border-destructive" : "border-border"
                      }`}
                      placeholder="john@yourbusiness.com"
                    />
                    {errors.email && (
                      <p className="text-xs text-destructive mt-1">{errors.email}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Website URL (optional)
                    </label>
                    <input
                      type="url"
                      name="websiteUrl"
                      value={formData.websiteUrl}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                        errors.websiteUrl ? "border-destructive" : "border-border"
                      }`}
                      placeholder="https://yourbusiness.com"
                    />
                    {errors.websiteUrl && (
                      <p className="text-xs text-destructive mt-1">{errors.websiteUrl}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      What&apos;s your biggest marketing challenge?
                    </label>
                    <textarea
                      name="marketingChallenge"
                      value={formData.marketingChallenge}
                      onChange={handleChange}
                      rows={3}
                      className={`w-full px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none ${
                        errors.marketingChallenge ? "border-destructive" : "border-border"
                      }`}
                      placeholder="Tell us what's not working..."
                    />
                    {errors.marketingChallenge && (
                      <p className="text-xs text-destructive mt-1">{errors.marketingChallenge}</p>
                    )}
                  </div>
                  <Button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-primary hover:bg-orange-dark text-primary-foreground py-6 text-lg"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 animate-spin" size={20} />
                        Submitting...
                      </>
                    ) : (
                      <>
                        Request My Free Analysis
                        <ArrowRight className="ml-2" size={20} />
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Takes 10-15 minutes. No obligation. 100% free.
                  </p>
                </form>
              </>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
