import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle, ArrowRight, Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { pricingData, type TierId } from "@/lib/pricingData";

const TIER_OPTIONS: { id: TierId; label: string }[] = [
  { id: "foundation", label: "Foundation" },
  { id: "growth", label: "Growth" },
  { id: "transformation", label: "Transformation" },
];

const signupSchema = z.object({
  firstName: z.string().trim().max(50).optional(),
  lastName: z.string().trim().max(50).optional(),
  businessName: z.string().trim().min(1, "Business name is required").max(100),
  email: z.string().trim().email("Invalid email address").max(255),
  websiteUrl: z.string().trim().max(255).regex(
    /^https?:\/\/[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+/,
    "Enter a valid website URL starting with http:// or https://"
  ),
  tier: z.enum(["foundation", "growth", "transformation"]),
});

const initialTierFromParam = (value: string | null): TierId =>
  TIER_OPTIONS.some((t) => t.id === value) ? (value as TierId) : "foundation";

export default function Signup() {
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    businessName: "",
    email: "",
    websiteUrl: "",
    tier: initialTierFromParam(searchParams.get("tier")),
    // Hidden from real visitors via CSS -- only bots fill this in.
    honeypot: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultStatus, setResultStatus] = useState<"created" | "existing_account" | null>(null);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = signupSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("signup", {
        body: {
          email: formData.email.trim(),
          business_name: formData.businessName.trim(),
          tier: formData.tier,
          first_name: formData.firstName.trim() || null,
          last_name: formData.lastName.trim() || null,
          website_url: formData.websiteUrl.trim() || null,
          honeypot: formData.honeypot,
        },
      });

      const errMsg = await getEdgeErrorMessage(error, data);
      if (errMsg) {
        toast.error(friendlyEdgeMessage(errMsg));
        return;
      }

      setResultStatus((data?.status as "created" | "existing_account") ?? "created");
    } catch (err) {
      console.error("Signup failed:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-32 pb-20">
        <div className="container-wide mx-auto px-4">
          <div className="mb-6">
            <BackButton />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-xl mx-auto"
          >
            <div className="text-center mb-10">
              <h1 className="text-3xl sm:text-4xl font-display font-semibold text-foreground mb-3">
                Get Started with SYSTEM
              </h1>
              <p className="text-muted-foreground">
                Create your account and we'll review it right away.
              </p>
            </div>

            <Card className="border-border">
              <CardContent className="pt-8">
                {resultStatus ? (
                  <div className="py-8 text-center space-y-4">
                    <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    </div>
                    <h2 className="text-xl font-display font-semibold text-foreground">
                      {resultStatus === "existing_account" ? "You're already signed up" : "You're all set!"}
                    </h2>
                    <p className="text-muted-foreground">
                      {resultStatus === "existing_account"
                        ? "An account with this email already exists. Check your inbox for next steps, or contact us if you need help."
                        : "We've received your signup and will review your account shortly. We'll be in touch by email once you're approved."}
                    </p>
                    <Button asChild variant="outline">
                      <Link to="/">Back to Home</Link>
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          value={formData.firstName}
                          onChange={(e) => handleChange("firstName", e.target.value)}
                          placeholder="John"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          value={formData.lastName}
                          onChange={(e) => handleChange("lastName", e.target.value)}
                          placeholder="Smith"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="businessName">Business Name *</Label>
                      <Input
                        id="businessName"
                        value={formData.businessName}
                        onChange={(e) => handleChange("businessName", e.target.value)}
                        placeholder="Acme Inc."
                        className={errors.businessName ? "border-destructive" : ""}
                      />
                      {errors.businessName && <p className="text-xs text-destructive">{errors.businessName}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleChange("email", e.target.value)}
                        placeholder="john@company.com"
                        className={errors.email ? "border-destructive" : ""}
                      />
                      {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="websiteUrl">Website *</Label>
                      <Input
                        id="websiteUrl"
                        value={formData.websiteUrl}
                        onChange={(e) => handleChange("websiteUrl", e.target.value)}
                        placeholder="https://example.com"
                        className={errors.websiteUrl ? "border-destructive" : ""}
                      />
                      {errors.websiteUrl && <p className="text-xs text-destructive">{errors.websiteUrl}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label>Plan *</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {TIER_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => handleChange("tier", option.id)}
                            className={cn(
                              "rounded-lg border p-3 text-center transition-colors",
                              formData.tier === option.id
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/50"
                            )}
                          >
                            <div className="text-sm font-semibold text-foreground">{option.label}</div>
                            <div className="text-xs text-muted-foreground">
                              from ${pricingData[option.id].startingAt}/mo
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Honeypot -- visually hidden from real visitors, only bots fill it in. */}
                    <div className="absolute -left-[9999px]" aria-hidden="true">
                      <label htmlFor="company_website">Leave this field blank</label>
                      <input
                        id="company_website"
                        name="company_website"
                        tabIndex={-1}
                        autoComplete="off"
                        value={formData.honeypot}
                        onChange={(e) => handleChange("honeypot", e.target.value)}
                      />
                    </div>

                    <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          Create Account
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
