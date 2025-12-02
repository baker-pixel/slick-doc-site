import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Clock, ArrowRight, CheckCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const timeSlots = [
  "9:00 AM",
  "9:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "1:00 PM",
  "1:30 PM",
  "2:00 PM",
  "2:30 PM",
  "3:00 PM",
  "3:30 PM",
  "4:00 PM",
  "4:30 PM",
];

const benefits = [
  "Review your current marketing performance",
  "Identify quick wins and growth opportunities",
  "Get a customized action plan",
  "No obligation, no pressure",
];

export default function ScheduleCall() {
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    businessName: "",
    challenge: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!date || !time) {
      toast({
        title: "Please select a date and time",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.from("contact_submissions").insert({
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email,
        business_name: formData.businessName,
        marketing_challenge: `Preferred: ${format(date, "PPP")} at ${time}. Challenge: ${formData.challenge}`,
        website_url: formData.phone,
        status: "strategy_call",
      });

      if (error) throw error;

      // Send confirmation email
      const { error: emailError } = await supabase.functions.invoke("send-booking-confirmation", {
        body: {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          businessName: formData.businessName,
          date: format(date, "EEEE, MMMM d, yyyy"),
          time: time,
          rawDate: date.toISOString(),
        },
      });

      if (emailError) {
        console.error("Failed to send confirmation email:", emailError);
      }

      setIsSubmitted(true);
      toast({
        title: "Request submitted!",
        description: "We'll confirm your strategy call shortly.",
      });
    } catch (error) {
      console.error("Error submitting:", error);
      toast({
        title: "Something went wrong",
        description: "Please try again or contact us directly.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-32 pb-20">
          <div className="container-wide mx-auto section-padding">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-2xl mx-auto text-center"
            >
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h1 className="text-3xl font-display font-semibold text-foreground mb-4">
                You're All Set!
              </h1>
              <p className="text-lg text-muted-foreground mb-2">
                We've received your strategy call request for:
              </p>
              <p className="text-xl font-semibold text-primary mb-6">
                {date && format(date, "EEEE, MMMM d, yyyy")} at {time}
              </p>
              <p className="text-muted-foreground mb-8">
                We'll send a confirmation email to <strong>{formData.email}</strong> within 24 hours
                with the meeting link and any prep materials.
              </p>
              <Button asChild size="lg">
                <a href="/">Return to Homepage</a>
              </Button>
            </motion.div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-32 pb-20">
        <div className="container-wide mx-auto section-padding">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            {/* Left Column - Info */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary border border-border mb-6">
                <Phone size={16} className="text-primary" />
                <span className="text-sm font-medium text-muted-foreground">
                  Free 30-Minute Call
                </span>
              </div>

              <h1 className="text-4xl lg:text-5xl font-display font-semibold text-foreground mb-6">
                Schedule Your{" "}
                <span className="text-gradient">Strategy Call</span>
              </h1>

              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                Book a free, no-obligation strategy session with our team. We'll
                review your current marketing, identify opportunities, and give
                you actionable next steps.
              </p>

              <div className="space-y-4 mb-8">
                {benefits.map((benefit, index) => (
                  <motion.div
                    key={benefit}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + index * 0.1 }}
                    className="flex items-center gap-3"
                  >
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <CheckCircle size={14} className="text-primary" />
                    </div>
                    <span className="text-foreground">{benefit}</span>
                  </motion.div>
                ))}
              </div>

              <div className="p-6 bg-secondary/50 rounded-xl border border-border">
                <p className="text-sm text-muted-foreground italic">
                  "The strategy call gave us clarity on exactly where to focus.
                  Within 3 months, our leads doubled."
                </p>
                <p className="text-sm font-medium text-foreground mt-3">
                  — Local Business Owner, Knoxville
                </p>
              </div>
            </motion.div>

            {/* Right Column - Form */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="bg-card border border-border rounded-2xl p-8 shadow-lg">
                <h2 className="text-xl font-semibold text-foreground mb-6">
                  Pick a Time That Works
                </h2>

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Date & Time Row */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Preferred Date *
                      </label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !date && "text-muted-foreground"
                            )}
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            {date ? format(date, "PPP") : "Select date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={date}
                            onSelect={setDate}
                            disabled={(date) =>
                              date < new Date() ||
                              date.getDay() === 0 ||
                              date.getDay() === 6
                            }
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Preferred Time *
                      </label>
                      <Select value={time} onValueChange={setTime}>
                        <SelectTrigger>
                          <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                          <SelectValue placeholder="Select time" />
                        </SelectTrigger>
                        <SelectContent>
                          {timeSlots.map((slot) => (
                            <SelectItem key={slot} value={slot}>
                              {slot}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Name Row */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        First Name *
                      </label>
                      <Input
                        required
                        value={formData.firstName}
                        onChange={(e) =>
                          setFormData({ ...formData, firstName: e.target.value })
                        }
                        placeholder="John"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Last Name *
                      </label>
                      <Input
                        required
                        value={formData.lastName}
                        onChange={(e) =>
                          setFormData({ ...formData, lastName: e.target.value })
                        }
                        placeholder="Smith"
                      />
                    </div>
                  </div>

                  {/* Contact Row */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Email *
                      </label>
                      <Input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        placeholder="john@business.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Phone
                      </label>
                      <Input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                        placeholder="(865) 555-1234"
                      />
                    </div>
                  </div>

                  {/* Business Name */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Business Name *
                    </label>
                    <Input
                      required
                      value={formData.businessName}
                      onChange={(e) =>
                        setFormData({ ...formData, businessName: e.target.value })
                      }
                      placeholder="Acme Services LLC"
                    />
                  </div>

                  {/* Challenge */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      What's your biggest marketing challenge?
                    </label>
                    <Textarea
                      value={formData.challenge}
                      onChange={(e) =>
                        setFormData({ ...formData, challenge: e.target.value })
                      }
                      placeholder="E.g., Not enough leads, poor website conversion, no time for marketing..."
                      rows={3}
                    />
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-primary hover:bg-orange-dark text-primary-foreground"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      "Submitting..."
                    ) : (
                      <>
                        Book My Strategy Call
                        <ArrowRight className="ml-2" size={18} />
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    We'll confirm your appointment within 24 hours via email.
                  </p>
                </form>
              </div>
            </motion.div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
